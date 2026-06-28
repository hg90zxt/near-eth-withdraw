#!/usr/bin/env node
/* Generates a simple PDF guide: "Manual.pdf". Run: node make-pdf.js */
const PDFDocument = require("pdfkit");
const fs = require("fs");

const FONT = "C:/Windows/Fonts/arial.ttf";
const FONT_B = "C:/Windows/Fonts/arialbd.ttf";
const MONO = "C:/Windows/Fonts/consola.ttf";

// Example placeholder address (NOT a real user's account)
const EXAMPLE_ADDR = "0x71C7…976F";

const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
doc.pipe(fs.createWriteStream("Manual.pdf"));
doc.registerFont("r", FONT);
doc.registerFont("b", FONT_B);
doc.registerFont("m", MONO);

const INK = "#1a1a1a", MUT = "#555", ACC = "#0d5c4a", BAR = "#eef3f1", LINE = "#d8e0dd";

function h1(t) { doc.moveDown(0.3); doc.font("b").fontSize(20).fillColor(ACC).text(t); doc.moveDown(0.4); }
function h2(t) { doc.moveDown(0.6); doc.font("b").fontSize(13).fillColor(INK).text(t); doc.moveDown(0.25); }
function p(t)  { doc.font("r").fontSize(10.5).fillColor(INK).text(t, { lineGap: 2 }); doc.moveDown(0.3); }
function mut(t){ doc.font("r").fontSize(9).fillColor(MUT).text(t, { lineGap: 1 }); doc.moveDown(0.3); }
function bullet(t){ doc.font("r").fontSize(10.5).fillColor(INK).text("•  " + t, { indent: 6, lineGap: 2 }); doc.moveDown(0.15); }
function code(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  doc.moveDown(0.15);
  const x = doc.x, y = doc.y, w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = arr.length * 13 + 14;
  doc.save().rect(x, y, w, h).fill(BAR).restore();
  doc.save().rect(x, y, w, h).lineWidth(0.5).stroke(LINE).restore();
  doc.font("m").fontSize(9.5).fillColor("#143");
  arr.forEach((ln, i) => doc.text(ln, x + 8, y + 7 + i * 13, { width: w - 16, lineBreak: false }));
  doc.y = y + h; doc.x = x; doc.moveDown(0.5);
}
function rule() { const x = doc.x, y = doc.y, w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(0.7).stroke(LINE).restore(); doc.moveDown(0.5); }

// ---------- TITLE ----------
h1("Withdraw native NEAR from an eth-implicit account");
mut("Simple guide • near-eth-withdraw • NEP-518 standard");
rule();
p("If you have an account that looks like " + EXAMPLE_ADDR + " (it's actually a NEAR account), " +
  "it holds native NEAR, and you control it with your EVM private key (the one you import into " +
  "MetaMask / Rabby) — this guide helps you move the funds out yourself.");
p("The idea: you sign the transfer LOCALLY with your key, get a short \"package\" (tx_bytes_b64), " +
  "and any ordinary account submits it on-chain, paying a tiny gas fee.");

h2("What you need");
bullet("Node.js 18+ (nodejs.org)");
bullet("Your EVM private key for the 0x… account");
bullet("Any ordinary NEAR account to pay gas (~0.001 NEAR)");

h2("Setup (once)");
p("Open the tool folder in a terminal and install dependencies:");
code("npm install");

// ---------- STEPS ----------
doc.addPage();
h1("Step by step");

h2("Step 1. Find your nonce");
p("The nonce is your account's transaction counter. On NearBlocks open your 0x… account → " +
  "Contract → method get_nonce → Query. The very first transaction = 0, then +1 each time.");
mut("You can skip the manual lookup: pass the word \"auto\" instead of a number and the script reads it for you.");

h2("Step 2. Sign the transfer (locally)");
p("Windows PowerShell — substitute your key, the receiver and the amount:");
code([
  '$env:PRIVATE_KEY = "0xYOUR_KEY"',
  "node sign.js <receiverAccountId> <amountNEAR> <nonce>",
  '$env:PRIVATE_KEY = ""',
]);
p("Example — send 1 NEAR, nonce 0:");
code("node sign.js alice.near 1 0");
p("The script prints a VERIFY block and a line with the two arguments:");
code('{"target":"alice.near","tx_bytes_b64":"+O6AAY…"}');
mut("Your key is never printed and never sent anywhere. Check that the \"from\" line is your 0x… account.");

h2("Step 3. (optional) Verify the package");
p("Decode the signed package and confirm the amount and receiver are correct — no key required:");
code('node verify.js "<tx_bytes_b64>" <receiverAccountId>');
p("It shows: destination, amount, nonce, sender, and whether everything matches the receiver (OK / MISMATCH).");

// ---------- SUBMIT ----------
doc.addPage();
h1("Step 4. Submit");
p("The easiest way is via NearBlocks:");
bullet("Open YOUR 0x… account page → Contract → Write tab.");
bullet("Top: Connect to Wallet — connect any account to pay gas (NOT the 0x… one; it has no normal key).");
bullet("Method rlp_execute → click Add and create 2 arguments, both Type = String:");
mut("       target        = the receiver account id (exactly as in the script)");
mut("       tx_bytes_b64  = the base64 from the script output");
bullet("Attached deposit = 0,  Gas = 100000000000000 (100 Tgas).");
bullet("Click Write and confirm in your wallet.");
p("Done when: get_nonce went up by 1, and the funds arrived at the receiver.");

rule();
h2("Important: three safety rules");
p("1) Don't drain to zero — leave a ~0.05–0.1 NEAR buffer on the account for its own storage, " +
  "otherwise the transfer is rejected (LackBalanceForState error).");
p("2) The target field must match the receiver the package was signed for. If it doesn't, the " +
  "transaction simply fails (funds are safe, only gas is spent).");
p("3) Transfers are irreversible. Double-check the receiver. Test with a small amount first.");

rule();
mut("This tool is provided \"as is\", without warranty. You are responsible for your own keys and " +
    "receiver addresses. The encoding was verified against the contract source near/near-wallet-contract.");

doc.end();
console.log("Created: Manual.pdf");
