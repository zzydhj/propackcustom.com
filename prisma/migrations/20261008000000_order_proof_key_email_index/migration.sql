-- 后台需要读取客户上传的付款凭证：私有桶下必须保存 R2 对象键才能按需预签名，
-- 否则销售只看得到文件名、无法核对水单就要点「标记已收款」，等于盲签。
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "proofKey" TEXT;

-- 登录时按邮箱认领匿名订单 / 匿名询价，这两处查询此前都是全表扫。
CREATE INDEX IF NOT EXISTS "Order_email_idx" ON "Order"("email");
CREATE INDEX IF NOT EXISTS "Quote_email_idx" ON "Quote"("email");
