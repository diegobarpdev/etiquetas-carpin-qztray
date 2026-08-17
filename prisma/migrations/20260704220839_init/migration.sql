-- CreateEnum
CREATE TYPE "BomType" AS ENUM ('kit', 'manufacture');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('draft', 'confirmed', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "label_templates" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html_template" TEXT NOT NULL,
    "css" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "ean" TEXT NOT NULL,
    "internal_ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "weight_kg" DECIMAL(10,4) NOT NULL,
    "height" DECIMAL(10,1) NOT NULL,
    "width" DECIMAL(10,1) NOT NULL,
    "length" DECIMAL(10,1) NOT NULL,
    "volume_m3" DECIMAL(10,4) NOT NULL,
    "num_bultos" INTEGER NOT NULL DEFAULT 1,
    "label_template_id" INTEGER NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_materials" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "type" "BomType" NOT NULL,

    CONSTRAINT "bills_of_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "component_product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(10,5) NOT NULL,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturing_orders" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "production_date" DATE NOT NULL,
    "state" "OrderState" NOT NULL DEFAULT 'confirmed',

    CONSTRAINT "manufacturing_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturing_order_lines" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(10,5) NOT NULL,

    CONSTRAINT "manufacturing_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "label_templates_code_key" ON "label_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_internal_ref_key" ON "products"("internal_ref");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_materials_product_id_key" ON "bills_of_materials"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturing_orders_name_key" ON "manufacturing_orders"("name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_label_template_id_fkey" FOREIGN KEY ("label_template_id") REFERENCES "label_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bills_of_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_order_lines" ADD CONSTRAINT "manufacturing_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "manufacturing_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_order_lines" ADD CONSTRAINT "manufacturing_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
