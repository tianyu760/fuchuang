-- MySQL 库表统一 utf8mb4_general_ci（切换到 MySQL 后执行）
CREATE DATABASE IF NOT EXISTS fayi
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;

USE fayi;

-- 已有表可执行：
-- ALTER DATABASE fayi CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- ALTER TABLE your_table CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
