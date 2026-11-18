const { chromium } = require("playwright");
const Database = require("better-sqlite3");

const CART_SELECTOR = "div._2CfekcK7._2tvoBM6w";  
const ITEM_SELECTOR = "div._1is6WIRd";

async function collectCart(page) {
  await page.waitForSelector(CART_SELECTOR, { timeout: 30000 });
  await page.waitForSelector(`${CART_SELECTOR} ${ITEM_SELECTOR}`, { timeout: 30000 });

  // Scroll only to trigger items loaded later; the number of products is never fixed.
  let previous = "";
  let stable = 0;
  let finished = false;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const progress = await page.evaluate(({ cartSelector, itemSelector }) => {
      const cart = document.querySelector(cartSelector);
      const rows = cart.querySelectorAll(itemSelector);
      let scrollable = cart;
      while (
        scrollable &&
        scrollable !== document.body &&
        scrollable.scrollHeight <= scrollable.clientHeight + 2
      ) {
        scrollable = scrollable.parentElement;
      }
      const viewport = !scrollable || scrollable === document.body ||
        scrollable === document.documentElement;
      if (viewport) {
        window.scrollBy(0, Math.max(window.innerHeight * 0.8, 200));
      } else {
        scrollable.scrollTop += Math.max(scrollable.clientHeight * 0.8, 200);
      }
      return {
        count: rows.length,
        height: viewport ? document.documentElement.scrollHeight : scrollable.scrollHeight,
        position: viewport ? window.scrollY : scrollable.scrollTop,
      };
    }, { cartSelector: CART_SELECTOR, itemSelector: ITEM_SELECTOR });

    await page.waitForTimeout(350);
    const signature = `${progress.count}:${progress.height}:${progress.position}`;
    stable = signature === previous ? stable + 1 : 0;
    previous = signature;
    if (stable >= 3) {
      finished = true;
      break;
    }
  }
  if (!finished) {
    throw new Error("El carrito no terminó de cargar; no se guardó una lista incompleta");
  }

  const { products, total, invalid } = await page.evaluate(
    ({ cartSelector, itemSelector }) => {
      const cart = document.querySelector(cartSelector);
      const rows = [...cart.querySelectorAll(itemSelector)];
      const products = [];
      const invalid = [];
      rows.forEach((prod, index) => {
        const name = prod.querySelector("a._2Tl9qLr1")?.innerText.trim();
        const priceText = prod.querySelector("span._2hmmv2gR")?.innerText;
        const price = priceText == null
          ? NaN
          : parseFloat(priceText.replace(/[^0-9,.]/g, "").replace(",", "."));
        const quantityInput = prod.querySelector("input[aria-label]");
        const quantity = quantityInput ? Number.parseInt(quantityInput.value, 10) : 1;
        if (!name || !Number.isFinite(price) || !Number.isInteger(quantity) || quantity < 1) {
          invalid.push({ row: index + 1, field: !name ? "nombre" : !Number.isFinite(price) ? "precio" : "cantidad" });
          return;
        }
        products.push({
          nombre: name,
          precio: price,
          imagen: prod.querySelector("div._2PQb6lDA img.wxWpAMbp")?.src ?? null,
          variante: prod.querySelector("div._1TbbNTn_ span")?.innerText.trim() || "N/A",
          cantidad: quantity,
          id_comprador: null,
        });
      });
      return { products, total: rows.length, invalid };
    },
    { cartSelector: CART_SELECTOR, itemSelector: ITEM_SELECTOR }
  );
  if (invalid.length) {
    throw new Error(`No se guardó el carrito: ${invalid.length} de ${total} filas sin datos válidos (${invalid.map(({ row, field }) => `${row}: ${field}`).join(", ")})`);
  }
  if (!total) {
    throw new Error("El carrito no contiene productos reconocibles; no se guardó nada");
  }
  return products;
}

async function main() {
  const context = await chromium.launchPersistentContext("./perfil-temu", {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await context.newPage();
  let db;

  try {
    await page.goto("https://www.temu.com/cart", {
      waitUntil: "networkidle",
    });

    const productos = await collectCart(page);
    db = new Database("compras.db");
    db.exec(`
      CREATE TABLE IF NOT EXISTS comprador (
        id_comprador INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pedido (
        id_pedido INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        imagen TEXT,
        variante TEXT,
        cantidad INTEGER NOT NULL,
        id_comprador INTEGER,
        FOREIGN KEY (id_comprador) REFERENCES comprador(id_comprador)
      );
    `);

    const insert = db.prepare(`
      INSERT INTO pedido (nombre, precio, imagen, variante, cantidad, id_comprador)
      VALUES (@nombre, @precio, @imagen, @variante, @cantidad, @id_comprador)
    `);

    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item);
    });

    insertMany(productos);

    console.log(
      `✅ Se han guardado ${productos.length} filas (${productos.reduce((sum, item) => sum + item.cantidad, 0)} unidades) en compras.db`
    );
  } catch (error) {
    console.error("❌ Error durante el proceso:", error);
  } finally {
    await context.close();
    db?.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { collectCart };
