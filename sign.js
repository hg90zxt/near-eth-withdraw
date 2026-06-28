#!/usr/bin/env node
/*
 * near-eth-withdraw — offline signer for the NEAR eth-wallet-contract (NEP-518).
 *
 * Signs a native NEAR transfer FROM an eth-implicit account ("0x…" account,
 * e.g. the "internal address" a near.com / Ethereum-wallet user controls with
 * their EVM private key) and prints the two `rlp_execute` arguments to submit.
 *
 * SECURITY
 *  - The private key is read ONLY from the PRIVATE_KEY env var.
 *  - The key is NEVER printed and NEVER sent anywhere. Signing is offline.
 *  - The only optional network call is a READ-ONLY nonce lookup (no key involved),
 *    used when you pass nonce = "auto".
 *
 * Encoding verified field-by-field against the contract source:
 *   github.com/near/near-wallet-contract  (wallet-contract/src: internal.rs, types.rs, lib.rs)
 */

const { ethers } = require("ethers");

const MAX_YOCTO = 10n ** 6n; // 1 eth-wei unit == 1e6 yoctoNEAR (contract MAX_YOCTO_NEAR)
const RPC = {
  mainnet: { chainId: 397, url: "https://rpc.mainnet.near.org" },
  testnet: { chainId: 398, url: "https://rpc.testnet.near.org" },
};

function usage(msg) {
  if (msg) console.error("Error: " + msg + "\n");
  console.error(
`near-eth-withdraw — sign a native NEAR transfer from an eth-implicit account

Usage:
  PRIVATE_KEY=0x... node sign.js <receiverAccountId> <amountNEAR> <nonce|auto> [--testnet]

Arguments:
  receiverAccountId  NEAR account that RECEIVES the funds
                     (e.g. alice.near, or a 64-hex implicit account id)
  amountNEAR         amount in NEAR, decimals allowed (e.g. 1  or  91.6)
  nonce              current nonce of YOUR eth-implicit account.
                     Use a number (first tx = 0), or "auto" to look it up via RPC.

Options:
  --testnet          NEAR testnet (chainId 398). Default: mainnet (397).

Env:
  PRIVATE_KEY        your secp256k1 key controlling the eth-implicit account (required)
  EXPECTED_FROM      optional "0x…" account; the script aborts if the key doesn't match it

Output:
  A VERIFY block (from / to / value / nonce) and the JSON {target, tx_bytes_b64}
  to paste into the wallet contract's rlp_execute (Write) on YOUR 0x… account.`
  );
  process.exit(1);
}

async function fetchNonce(url, accountId) {
  const body = {
    jsonrpc: "2.0", id: 1, method: "query",
    params: {
      request_type: "call_function", finality: "final",
      account_id: accountId, method_name: "get_nonce", args_base64: "",
    },
  };
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error || !json.result || !json.result.result) {
    throw new Error("RPC get_nonce failed: " + JSON.stringify(json.error || json));
  }
  const text = Buffer.from(json.result.result).toString("utf8"); // e.g. "\"1\""
  return Number(text.replace(/"/g, ""));
}

(async () => {
  const argv = process.argv.slice(2);
  const testnet = argv.includes("--testnet");
  const net = testnet ? RPC.testnet : RPC.mainnet;
  const pos = argv.filter((a) => a !== "--testnet");
  const [receiver, amountStr, nonceArg] = pos;
  if (!receiver || !amountStr || nonceArg === undefined) usage();

  const pk = process.env.PRIVATE_KEY;
  if (!pk) usage("set the PRIVATE_KEY env var. Do NOT pass the key as an argument.");

  let wallet;
  try { wallet = new ethers.Wallet(pk); }
  catch { return usage("PRIVATE_KEY is not a valid secp256k1 key."); }

  const expected = process.env.EXPECTED_FROM;
  if (expected && wallet.address.toLowerCase() !== expected.toLowerCase()) {
    console.error("STOP: key maps to " + wallet.address + " but EXPECTED_FROM=" + expected);
    console.error("The wallet contract rejects signatures from any other key. Aborting.");
    process.exit(2);
  }

  // The eth-implicit account id is just the lowercase 0x-address.
  const accountId = wallet.address.toLowerCase();

  // nonce: number or "auto" (read-only RPC lookup)
  let nonce;
  if (String(nonceArg).toLowerCase() === "auto") {
    try { nonce = await fetchNonce(net.url, accountId); }
    catch (e) { return usage("could not auto-fetch nonce (" + e.message + "). Pass it manually."); }
  } else {
    nonce = Number(nonceArg);
    if (!Number.isInteger(nonce) || nonce < 0) return usage("nonce must be a non-negative integer or 'auto'.");
  }

  // amount (NEAR) -> total yoctoNEAR (24 decimals) -> eth value + uint32 remainder
  let totalYocto;
  try { totalYocto = ethers.parseUnits(amountStr, 24); }
  catch { return usage("amountNEAR is not a valid number."); }
  const value = totalYocto / MAX_YOCTO;
  const yoctoNear = Number(totalYocto % MAX_YOCTO);

  // calldata = selector("transfer(string,uint32)") + abi(receiver_id, yocto_near)
  const selector = ethers.id("transfer(string,uint32)").slice(0, 10); // 0x3ed64124
  const argsEnc = ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint32"], [receiver, yoctoNear]);
  const data = selector + argsEnc.slice(2);

  // to = last 20 bytes of keccak256(utf8(receiver_id))  (contract: account_id_to_address)
  const to = ethers.getAddress("0x" + ethers.keccak256(ethers.toUtf8Bytes(receiver)).slice(-40));

  const tx = {
    type: 0, chainId: net.chainId, nonce, to, value, data,
    gasLimit: 21000n, // contract check: prepaid_gas >= gasLimit*1e8  -> needs 2.1 Tgas
    gasPrice: 1n,     // 1 wei; not charged for a native transfer
  };

  const signed = await wallet.signTransaction(tx);
  const b64 = Buffer.from(signed.slice(2), "hex").toString("base64");

  console.log("\n================ VERIFY BEFORE SUBMITTING ================");
  console.log("network                  :", testnet ? "testnet (398)" : "mainnet (397)");
  console.log("from (your 0x account)   :", wallet.address);
  console.log("receiver / target        :", receiver);
  console.log("amount                   :", amountStr, "NEAR  (value=" + value + ", yoctoNear=" + yoctoNear + ")");
  console.log("nonce                    :", nonce);
  console.log("to (keccak-derived)      :", to);
  console.log("\n===== rlp_execute arguments (target & tx_bytes_b64, both type String) =====");
  console.log(JSON.stringify({ target: receiver, tx_bytes_b64: b64 }));
  console.log("\nSubmit: call rlp_execute ON " + accountId + " | deposit 0 | gas 100 Tgas (100000000000000)");
})();
