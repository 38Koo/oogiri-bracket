-- void:allow-destructive
-- 集計機能の削除に伴い、集計への掲載フラグを削除する (保存していたのは掲載の選択だけ)
ALTER TABLE `participants` DROP COLUMN `share_stats`;
