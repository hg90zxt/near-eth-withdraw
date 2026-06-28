#!/usr/bin/env node
/* Генерирует русский PDF-мануал: "Мануал.pdf". Запуск: node make-pdf-ru.js */
const PDFDocument = require("pdfkit");
const fs = require("fs");

const FONT = "C:/Windows/Fonts/arial.ttf";
const FONT_B = "C:/Windows/Fonts/arialbd.ttf";
const MONO = "C:/Windows/Fonts/consola.ttf";

// Пример-адрес (НЕ реальный аккаунт пользователя)
const EXAMPLE_ADDR = "0x71C7…976F";

const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
doc.pipe(fs.createWriteStream("Мануал.pdf"));
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
h1("Вывод нативных NEAR с eth-implicit аккаунта");
mut("Простой мануал • near-eth-withdraw • стандарт NEP-518");
rule();
p("Если у тебя есть адрес вида " + EXAMPLE_ADDR + " (это NEAR-аккаунт), на нём лежат нативные " +
  "NEAR, и управляешь ты им EVM-приватником (тем, что импортируется в MetaMask/Rabby) — " +
  "этот мануал поможет вывести средства самостоятельно.");
p("Идея: ты ЛОКАЛЬНО подписываешь перевод своим ключом, получаешь короткий «пакет» " +
  "(tx_bytes_b64), а отправляет его на блокчейн любой обычный аккаунт, оплачивая копеечный газ.");

h2("Что понадобится");
bullet("Node.js 18+ (nodejs.org)");
bullet("Твой EVM-приватник от 0x… аккаунта");
bullet("Любой обычный NEAR-аккаунт для оплаты газа (~0.001 NEAR)");

h2("Подготовка (один раз)");
p("Открой папку с инструментом в терминале и установи зависимости:");
code("npm install");

// ---------- STEPS ----------
doc.addPage();
h1("Пошагово");

h2("Шаг 1. Узнать nonce");
p("Nonce — счётчик транзакций твоего аккаунта. На NearBlocks открой свой 0x… аккаунт → " +
  "Contract → метод get_nonce → Query. Первая транзакция = 0, дальше +1 каждый раз.");
mut("Можно не считать вручную — передай слово auto вместо числа, скрипт прочитает сам.");

h2("Шаг 2. Подписать перевод (локально)");
p("Windows PowerShell — подставь свой ключ, адрес получателя и сумму:");
code([
  '$env:PRIVATE_KEY = "0xТВОЙ_КЛЮЧ"',
  "node sign.js <адрес_получателя> <сумма> <nonce>",
  '$env:PRIVATE_KEY = ""',
]);
p("Пример — отправить 1 NEAR, nonce 0:");
code("node sign.js alice.near 1 0");
p("Скрипт напечатает блок VERIFY и строку с двумя аргументами:");
code('{"target":"alice.near","tx_bytes_b64":"+O6AAY…"}');
mut("Ключ нигде не печатается и в сеть не уходит. Сверь, что строка from = твой 0x… аккаунт.");

h2("Шаг 3. (по желанию) Проверить пакет");
p("Расшифруй подписанный пакет и убедись, что сумма и адрес верные — ключ не нужен:");
code('node verify.js "<tx_bytes_b64>" <адрес_получателя>');
p("Покажет: куда, сколько, nonce, отправитель, и совпадает ли всё с получателем (OK / MISMATCH).");

// ---------- SUBMIT ----------
doc.addPage();
h1("Шаг 4. Отправить");
p("Самый простой способ — через NearBlocks:");
bullet("Открой страницу СВОЕГО 0x… аккаунта → вкладка Contract → Write.");
bullet("Сверху Connect to Wallet — подключи аккаунт для газа (НЕ сам 0x…, у него нет обычного ключа).");
bullet("Метод rlp_execute → кнопкой Add добавь 2 аргумента, у обоих Type = String:");
mut("       target        = адрес получателя (точно как в скрипте)");
mut("       tx_bytes_b64  = base64 из вывода скрипта");
bullet("Attached deposit = 0,  Gas = 100000000000000 (100 Tgas).");
bullet("Нажми Write и подтверди в кошельке.");
p("Готово, когда: get_nonce увеличился на 1, а средства пришли получателю.");

rule();
h2("Важно: три правила безопасности");
p("1) Не выводи всё «в ноль» — оставь на аккаунте буфер ~0.05–0.1 NEAR на хранилище, иначе " +
  "перевод отклонится (ошибка LackBalanceForState).");
p("2) Адрес в поле target обязан совпадать с тем, под который подписан пакет. Не совпадёт — " +
  "транзакция просто не пройдёт (деньги целы, тратится лишь газ).");
p("3) Перевод необратим. Дважды проверь адрес получателя. Сначала протестируй на маленькой сумме.");

rule();
mut("Инструмент предоставляется «как есть», без гарантий. Ты сам отвечаешь за свои ключи и " +
    "адреса получателей. Кодировка сверена с исходником контракта near/near-wallet-contract.");

doc.end();
console.log("Создан: Мануал.pdf");
