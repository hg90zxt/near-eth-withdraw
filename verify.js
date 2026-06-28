#!/usr/bin/env node
/*
 * verify.js — decode a signed rlp_execute payload and show what it really does.
 * No private key needed: a signed tx is public. Use this to double-check a blob
 * before submitting (or to inspect someone else's).
 *
 * Usage:
 *   node verify.js <tx_bytes_b64> [expectedTargetAccountId]
 */
const { ethers } = require("ethers");

const b64 = process.argv[2];
const expectedTarget = process.argv[3];
if (!b64) {
  console.error("Usage: node verify.js <tx_bytes_b64> [expectedTargetAccountId]");
  process.exit(1);
}

const hex = "0x" + Buffer.from(b64, "base64").toString("hex");
const tx = ethers.Transaction.from(hex);

// calldata: 4-byte selector + abi(string receiver_id, uint32 yocto_near)
let receiverId = "(unparsable)", yoctoNear = "(n/a)";
try {
  const dec = ethers.AbiCoder.defaultAbiCoder().decode(["string", "uint32"], "0x" + tx.data.slice(10));
  receiverId = dec[0]; yoctoNear = dec[1].toString();
} catch {}

const totalYocto = tx.value * (10n ** 6n) + BigInt(yoctoNear === "(n/a)" ? 0 : yoctoNear);
const near = ethers.formatUnits(totalYocto, 24);

console.log("decoded signed transaction");
console.log("  selector        :", tx.data.slice(0, 10), tx.data.slice(0, 10) === "0x3ed64124" ? "(transfer)" : "(not a native transfer!)");
console.log("  from (signer)   :", tx.from);
console.log("  to (address)    :", tx.to);
console.log("  chainId         :", tx.chainId.toString(), tx.chainId === 397n ? "(mainnet)" : tx.chainId === 398n ? "(testnet)" : "(?!)");
console.log("  nonce           :", tx.nonce);
console.log("  value (raw)     :", tx.value.toString());
console.log("  receiver_id     :", receiverId);
console.log("  yocto_near      :", yoctoNear);
console.log("  => sends        :", near, "NEAR  to  " + receiverId);

if (expectedTarget) {
  const wantTo = ethers.getAddress("0x" + ethers.keccak256(ethers.toUtf8Bytes(expectedTarget)).slice(-40));
  const okTarget = receiverId === expectedTarget;
  const okTo = tx.to && tx.to.toLowerCase() === wantTo.toLowerCase();
  console.log("\ncheck against target:", expectedTarget);
  console.log("  receiver_id == target :", okTarget ? "OK" : "MISMATCH");
  console.log("  to == hash(target)    :", okTo ? "OK" : "MISMATCH (expected " + wantTo + ")");
  if (!okTarget || !okTo) process.exitCode = 3;
}
