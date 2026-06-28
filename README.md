# near-eth-withdraw

**English** · [Русский](README.ru.md)

Offline signer to withdraw **native NEAR** from an **eth-implicit account** (`0x…`) —
the "internal address" you control with your **EVM private key**
(near.com / Ethereum wallets on NEAR, the [NEP-518](https://github.com/near/NEPs/issues/518) standard).

The script signs the transfer **locally** (your key never leaves the machine) and outputs
the two arguments for the wallet contract's `rlp_execute` method. Submitting it (paying gas)
is done by any ordinary NEAR account via NearBlocks or near-cli.

> The encoding is verified line-by-line against the contract source
> [`near/near-wallet-contract`](https://github.com/near/near-wallet-contract)
> (`wallet-contract/src`: `internal.rs`, `types.rs`, `lib.rs`).

---

## When you need this

You have an account like `0x71C7…976F` (a NEAR account, not Ethereum), it holds
**native NEAR**, and there's no normal NEAR key for it — but you have an **EVM private key**
(imports into MetaMask/Rabby). That's an eth-implicit account: it's controlled by a
secp256k1 key through a deployed wallet contract. This tool lets you withdraw its NEAR
yourself, without waiting for support.

---

## How it works (short)

1. A legacy Ethereum transaction is signed locally (`chainId 397` mainnet) that encodes a
   NEAR transfer: `transfer(string receiver_id, uint32 yocto_near)`,
   `value = yocto_amount / 1e6`, `to = keccak256(receiver_id)[-20:]`.
2. The signed RLP is base64-encoded → that's `tx_bytes_b64`.
3. Any account calls `rlp_execute(target, tx_bytes_b64)` on your `0x…` account and pays
   ~0.001 NEAR of gas. The contract verifies the signature and performs the transfer.

Safety: only the key owner can produce the signature. If anything in the blob doesn't match
`target`, the contract simply rejects the call (only gas is spent, funds are safe).

---

## Install

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
```

---

## Usage

### Step 1. Find your nonce

Your account's current nonce = the contract's `get_nonce` method (on NearBlocks → Contract →
`get_nonce` → Query). The very first transaction = `0`, then +1 each time.
Or pass `auto` and the script reads it via RPC.

### Step 2. Sign (locally)

PowerShell (Windows):
```powershell
$env:PRIVATE_KEY = "0xYOUR_EVM_KEY"
node sign.js <receiverAccountId> <amountNEAR> <nonce>
$env:PRIVATE_KEY = ""
```

bash / macOS / Linux:
```bash
PRIVATE_KEY=0x... node sign.js <receiverAccountId> <amountNEAR> <nonce>
```

Examples:
```bash
PRIVATE_KEY=0x... node sign.js alice.near 1 0
# skip manual nonce lookup:
PRIVATE_KEY=0x... node sign.js alice.near 12.5 auto
# testnet:
PRIVATE_KEY=0x... node sign.js alice.testnet 1 0 --testnet
```

The script prints a `VERIFY` block (check `from` = your `0x…` account) and a line
`{"target":"…","tx_bytes_b64":"…"}`.

### Step 3. (optional) Verify the blob

```bash
node verify.js "<tx_bytes_b64>" <receiverAccountId>
```
Decodes the signed transaction and shows: destination, amount, nonce, sender, and whether
everything matches `target`. No key required.

### Step 4. Submit `rlp_execute`

**Option A — NearBlocks (easiest):**
1. Open **your** `0x…` account page → **Contract → Write** tab.
2. Top: **Connect to Wallet** — connect any ordinary account to pay gas
   (**not** the `0x…` one; it has no normal key).
3. Method **`rlp_execute`**, click **Add** and create two arguments (both Type = **String**):
   - `target` = receiverAccountId (exactly as in the script)
   - `tx_bytes_b64` = the base64 from the output
4. Attached deposit = `0`, Gas = `100000000000000` (100 Tgas) → **Write** → confirm.

**Option B — near-cli-rs:**
```bash
near contract call-function as-transaction <YOUR_0x_ACCOUNT> rlp_execute \
  json-args '{"target":"<receiver>","tx_bytes_b64":"<base64>"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  sign-as <GAS_ACCOUNT> network-config mainnet sign-with-keychain send
```

**Success check:** `get_nonce` went up by 1 and the funds arrived at the receiver.

---

## ⚠️ Important

- **Don't drain to zero.** The account must keep a little NEAR for its own storage, otherwise
  the transfer is rejected (`LackBalanceForState`). Leave a ~0.05–0.1 NEAR buffer.
- **`target` must match** the `receiverAccountId` the blob was signed for. If it doesn't, the
  call errors (funds are safe, only gas is spent).
- **Transfers are irreversible.** Double-check the receiver address.

---

## FAQ

**Is it safe? Won't the script steal my key?**
The key is read only from the `PRIVATE_KEY` env var, never printed and never sent over the
network. Signing is local. The code is open — read `sign.js`. You can run it with the internet
off (then pass nonce as a number, not `auto`).

**What is `tx_bytes_b64`? Is it safe to show?**
It's an already-signed transaction in base64. There's no private key in it — only the
signature. Safe to share. Anyone can inspect it with `verify.js`.

**Why does `value` in the blob look like 18 digits, not 24?**
Ethereum uses 18 decimals, NEAR uses 24. The contract multiplies `value` by `1e6` and adds
`yocto_near` (the remainder). So `value = yocto_amount / 1e6`. The script computes this for you.

**Can I send to an exchange / named account (`name.near`)?**
Yes, `receiverAccountId` can be any valid NEAR account. For exchanges, note they often need a
MEMO/tag — a native transfer can't carry one, so check with the exchange.

**Who pays gas?**
The account you sign the `rlp_execute` call with (~0.001 NEAR). It's unrelated to the balance
of the `0x…` account being withdrawn.

**I sent to an address I don't own. Can I get it back?**
No. Transfers are irreversible. That's why Step 3 (`verify.js`) and double-checking the
address are essential.

---

## Files

- `sign.js` — sign a transfer, get the `rlp_execute` arguments
- `verify.js` — decode/verify a signed blob (no key needed)
- `make-pdf.js` / `make-pdf-ru.js` — build a PDF version of the guide (optional)

## Disclaimer

This tool is provided "as is", without warranty. You are responsible for your own keys and
receiver addresses. Test with a small amount first.
