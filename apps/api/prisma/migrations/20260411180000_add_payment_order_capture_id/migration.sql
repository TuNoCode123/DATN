-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN "providerCaptureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_providerCaptureId_key" ON "payment_orders"("providerCaptureId");
