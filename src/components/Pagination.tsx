// 网格分页控件：上一页/下一页 + 页码指示（数据按页拉取，无总数时用「是否有下一页」推断）
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  /** 当前页返回的条数，用于推断是否还有下一页 */
  pageCount: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, pageSize, onChange }: PaginationProps) {
  const hasPrev = page > 1;
  const hasNext = pageCount === pageSize;

  if (!hasPrev && !hasNext) return null;

  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      <Button
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        onClick={() => onChange(page - 1)}
        aria-label="上一页"
      >
        <ChevronLeft className="size-4" /> 上一页
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">第 {page} 页</span>
      <Button
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
        aria-label="下一页"
      >
        下一页 <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
