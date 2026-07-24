-- CreateTable
CREATE TABLE "keyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "term" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "price_num" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "sales" INTEGER NOT NULL DEFAULT 0,
    "shop_name" TEXT NOT NULL,
    "shop_url" TEXT NOT NULL,
    "product_url" TEXT NOT NULL,
    "image_url" TEXT,
    "category" TEXT,
    "location" TEXT,
    "is_dropship" BOOLEAN NOT NULL DEFAULT false,
    "heat_score" REAL NOT NULL DEFAULT 0,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "push_count" INTEGER NOT NULL DEFAULT 0,
    "last_pushed_at" DATETIME
);

-- CreateTable
CREATE TABLE "product_snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "sales" INTEGER NOT NULL,
    "heat_score" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_snapshot_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "push_log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "keyword_id" INTEGER,
    "chat_id" INTEGER NOT NULL,
    "message_id" INTEGER,
    "score" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "keyword_id_key" ON "keyword"("id");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_term_key" ON "keyword"("term");

-- CreateIndex
CREATE UNIQUE INDEX "product_id_key" ON "product"("id");

-- CreateIndex
CREATE UNIQUE INDEX "product_source_id_key" ON "product"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_snapshot_id_key" ON "product_snapshot"("id");

-- CreateIndex
CREATE INDEX "product_snapshot_product_id_created_at_idx" ON "product_snapshot"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_log_id_key" ON "push_log"("id");
