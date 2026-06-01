import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Upload, Loader2, Trash2, Sparkles, Wallet, X, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { analyzeReceipt } from "@/lib/analyze-receipt.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "스냅가계부 · AI 영수증 분석" },
      { name: "description", content: "결제 스크린샷을 업로드하면 AI가 자동으로 가계부에 정리해드립니다." },
    ],
  }),
  component: Index,
});

const CATEGORIES = ["식비", "카페", "교통", "쇼핑", "의료", "생활", "문화/여가", "주거/통신", "기타"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, string> = {
  식비: "bg-orange-100 text-orange-700",
  카페: "bg-amber-100 text-amber-700",
  교통: "bg-sky-100 text-sky-700",
  쇼핑: "bg-pink-100 text-pink-700",
  의료: "bg-emerald-100 text-emerald-700",
  생활: "bg-violet-100 text-violet-700",
  "문화/여가": "bg-fuchsia-100 text-fuchsia-700",
  "주거/통신": "bg-slate-100 text-slate-700",
  기타: "bg-zinc-100 text-zinc-700",
};

type Expense = {
  id: string;
  spent_at: string;
  merchant: string;
  amount: number;
  category: string;
  memo: string | null;
};

type Draft = {
  spent_at: string;
  merchant: string;
  amount: string;
  category: Category;
  memo: string;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function Index() {
  const analyze = useServerFn(analyzeReceipt);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("spent_at", { ascending: false });
    if (error) toast.error("내역을 불러오지 못했습니다");
    else setExpenses((data ?? []) as Expense[]);
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return expenses
      .filter((e) => {
        const d = new Date(e.spent_at);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [expenses]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("이미지 파일만 업로드할 수 있어요");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error("8MB 이하 이미지만 가능해요");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        setAnalyzing(true);
        try {
          const result = await analyze({ data: { imageDataUrl: dataUrl } });
          setDraft({
            spent_at: toLocalInput(result.spent_at),
            merchant: result.merchant,
            amount: String(result.amount),
            category: (CATEGORIES as readonly string[]).includes(result.category)
              ? (result.category as Category)
              : "기타",
            memo: "",
          });
          toast.success("분석 완료! 내용을 확인하고 저장해주세요");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "분석에 실패했습니다";
          toast.error(msg);
          setPreview(null);
        } finally {
          setAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [analyze],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const resetDraft = () => {
    setDraft(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveDraft = async () => {
    if (!draft) return;
    const amountNum = Number(draft.amount.replace(/[^\d.]/g, ""));
    if (!draft.merchant.trim() || !amountNum || !draft.spent_at) {
      toast.error("사용처, 금액, 날짜를 모두 입력해주세요");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("expenses").insert({
      spent_at: new Date(draft.spent_at).toISOString(),
      merchant: draft.merchant.trim(),
      amount: amountNum,
      category: draft.category,
      memo: draft.memo.trim() || null,
    });
    setLoading(false);
    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    toast.success("가계부에 저장되었습니다");
    resetDraft();
    loadExpenses();
  };

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error("삭제 실패");
    else {
      toast.success("삭제되었습니다");
      loadExpenses();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary grid place-items-center">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">스냅가계부</h1>
            <p className="text-xs text-muted-foreground">스크린샷 한 장이면 끝</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pt-6 space-y-6">
        {/* Dashboard */}
        <section className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.55_0.2_265)] text-primary-foreground p-6 shadow-sm">
          <p className="text-sm/none opacity-80">{monthLabel} 총지출</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{won(monthTotal)}</p>
          <p className="mt-1 text-xs opacity-75">
            전체 {expenses.length}건 저장됨
          </p>
        </section>

        {/* Upload */}
        {!draft && (
          <section>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative block rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
                dragOver ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={analyzing}
              />
              {analyzing ? (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div className="relative">
                    <Loader2 className="size-10 animate-spin text-primary" />
                    <Sparkles className="size-4 text-primary absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <p className="font-medium">AI가 내역을 분석 중입니다...</p>
                  <p className="text-xs text-muted-foreground">잠시만 기다려주세요</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="size-12 rounded-full bg-primary-soft grid place-items-center">
                    <Upload className="size-5 text-primary" />
                  </div>
                  <p className="font-semibold">결제 스크린샷 업로드</p>
                  <p className="text-xs text-muted-foreground">
                    문자, 은행앱, 영수증 사진을 여기에 놓거나 탭하세요
                  </p>
                </div>
              )}
            </label>
          </section>
        )}

        {/* Draft form */}
        {draft && (
          <section className="rounded-2xl bg-card border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="font-semibold">AI 추출 결과 확인</h2>
              </div>
              <button
                onClick={resetDraft}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="취소"
              >
                <X className="size-4" />
              </button>
            </div>

            {preview && (
              <div className="rounded-xl overflow-hidden border bg-muted max-h-48 flex items-center justify-center">
                <img src={preview} alt="업로드한 스크린샷" className="max-h-48 object-contain" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="merchant" className="text-xs">사용처</Label>
                <Input
                  id="merchant"
                  value={draft.merchant}
                  onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="amount" className="text-xs">금액 (원)</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="category" className="text-xs">카테고리</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft({ ...draft, category: v as Category })}
                >
                  <SelectTrigger id="category" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="spent_at" className="text-xs">결제일시</Label>
                <Input
                  id="spent_at"
                  type="datetime-local"
                  value={draft.spent_at}
                  onChange={(e) => setDraft({ ...draft, spent_at: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="memo" className="text-xs">메모 (선택)</Label>
                <Input
                  id="memo"
                  value={draft.memo}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                  className="mt-1"
                  placeholder="예: 친구와 점심"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={resetDraft} className="flex-1">
                취소
              </Button>
              <Button onClick={saveDraft} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="size-4 animate-spin" /> : "저장"}
              </Button>
            </div>
          </section>
        )}

        {/* List */}
        <section>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="font-semibold">최근 내역</h2>
            <span className="text-xs text-muted-foreground">{expenses.length}건</span>
          </div>
          {expenses.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              아직 저장된 내역이 없어요.<br />첫 스크린샷을 올려보세요!
            </div>
          ) : (
            <ul className="rounded-2xl bg-card border divide-y overflow-hidden">
              {expenses.map((e) => {
                const d = new Date(e.spent_at);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                const color = CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS["기타"];
                return (
                  <li key={e.id} className="group flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${color}`}>
                          {e.category}
                        </span>
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                      </div>
                      <p className="mt-1 font-medium truncate">{e.merchant}</p>
                      {e.memo && <p className="text-xs text-muted-foreground truncate">{e.memo}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{won(Number(e.amount))}</p>
                    </div>
                    <button
                      onClick={() => deleteExpense(e.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition p-1"
                      aria-label="삭제"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
