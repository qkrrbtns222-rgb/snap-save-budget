import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Upload, Loader2, Trash2, Sparkles, Wallet, X, Plus, BarChart3, RotateCcw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

const ASSETS = [
  "신한은행",
  "국민은행",
  "우리은행",
  "하나은행",
  "카카오뱅크",
  "토스뱅크",
  "신한카드",
  "국민카드",
  "삼성카드",
  "현대카드",
  "롯데카드",
  "BC카드",
  "카카오페이",
  "네이버페이",
  "토스",
  "현금",
  "기타",
] as const;
type Asset = (typeof ASSETS)[number];

type Expense = {
  id: string;
  spent_at: string;
  merchant: string;
  amount: number;
  category: string;
  asset: string;
  memo: string | null;
};

type Draft = {
  id: string;
  spent_at: string;
  merchant: string;
  amount: string;
  category: Category;
  asset: string;
  memo: string;
};


const makeDraftId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
  const [draftList, setDraftList] = useState<Draft[]>([]);
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

  const totalAll = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );

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

  const monthByAsset = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const map = new Map<string, number>();
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const key = e.asset || "기타";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const monthLabel = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  }, []);

  const monthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const budgetStorageKey = `budgets:${monthKey}`;
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(budgetStorageKey);
      if (raw) setBudgets(JSON.parse(raw));
      else setBudgets({});
    } catch {
      setBudgets({});
    }
  }, [budgetStorageKey]);

  const monthByCategory = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const map = new Map<string, number>();
    for (const c of CATEGORIES) map.set(c, 0);
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      const key = (CATEGORIES as readonly string[]).includes(e.category) ? e.category : "기타";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return map;
  }, [expenses]);

  const openBudgetDialog = () => {
    const draft: Record<string, string> = {};
    for (const c of CATEGORIES) {
      draft[c] = budgets[c] ? String(budgets[c]) : "";
    }
    setBudgetDraft(draft);
    setBudgetDialogOpen(true);
  };

  const saveBudgets = () => {
    const next: Record<string, number> = {};
    for (const c of CATEGORIES) {
      const n = Number((budgetDraft[c] ?? "").replace(/[^\d]/g, ""));
      if (n > 0) next[c] = n;
    }
    setBudgets(next);
    try {
      localStorage.setItem(budgetStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    setBudgetDialogOpen(false);
    toast.success("예산이 저장되었습니다");
  };

  const budgetRows = useMemo(() => {
    return CATEGORIES.map((c) => {
      const budget = budgets[c] ?? 0;
      const spent = monthByCategory.get(c) ?? 0;
      const ratio = budget > 0 ? spent / budget : 0;
      return { category: c, budget, spent, ratio };
    }).filter((r) => r.budget > 0 || r.spent > 0);
  }, [budgets, monthByCategory]);




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
          const items = result.expenses ?? [];
          if (items.length === 0) {
            toast.error("결제 내역을 찾지 못했어요. 다른 사진을 올려보세요.");
            setPreview(null);
            return;
          }
          const newDrafts: Draft[] = items.map((it) => ({
            id: makeDraftId(),
            spent_at: toLocalInput(it.spent_at),
            merchant: it.merchant,
            amount: String(it.amount),
            category: (CATEGORIES as readonly string[]).includes(it.category)
              ? (it.category as Category)
              : "기타",
            asset: (it.asset ?? "").trim() || "기타",
            memo: "",
          }));

          setDraftList((prev) => [...prev, ...newDrafts]);
          toast.success(`${newDrafts.length}건 분석 완료! 내용을 확인하고 저장해주세요`);
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

  const updateDraft = (id: string, patch: Partial<Draft>) =>
    setDraftList((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const removeDraft = (id: string) =>
    setDraftList((prev) => prev.filter((d) => d.id !== id));

  const resetAll = () => {
    setDraftList([]);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const draftToInsert = (d: Draft) => {
    const amountNum = Number(d.amount.replace(/[^\d.]/g, ""));
    if (!d.merchant.trim() || !amountNum || !d.spent_at) return null;
    return {
      spent_at: new Date(d.spent_at).toISOString(),
      merchant: d.merchant.trim(),
      amount: amountNum,
      category: d.category,
      asset: d.asset.trim() || "기타",
      memo: d.memo.trim() || null,
    };

  };

  const saveAll = async () => {
    if (draftList.length === 0) return;
    const rows = draftList.map(draftToInsert);
    if (rows.some((r) => r === null)) {
      toast.error("사용처, 금액, 날짜를 모두 입력해주세요");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("expenses").insert(rows as NonNullable<ReturnType<typeof draftToInsert>>[]);
    setLoading(false);
    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    toast.success(`${rows.length}건 저장되었습니다`);
    resetAll();
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
          <p className="text-sm/none opacity-80">전체 총지출</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{won(totalAll)}</p>
          <div className="mt-3 flex items-center justify-between text-xs opacity-80">
            <span>{monthLabel}: {won(monthTotal)}</span>
            <span>{expenses.length}건</span>
          </div>
        </section>

        {/* Budgets */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-1.5">
              <Target className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">{monthLabel} 카테고리 예산</h2>
            </div>
            <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
              <Button size="sm" variant="outline" onClick={openBudgetDialog} className="h-7 text-xs">
                예산 설정
              </Button>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{monthLabel} 예산 설정</DialogTitle>
                  <DialogDescription>
                    카테고리별 목표 금액을 입력해주세요. 비워두면 예산이 해제됩니다.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {CATEGORIES.map((c) => (
                    <div key={c} className="flex items-center gap-3">
                      <Label className="w-20 text-sm shrink-0">{c}</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        value={budgetDraft[c] ?? ""}
                        onChange={(e) =>
                          setBudgetDraft((prev) => ({ ...prev, [c]: e.target.value }))
                        }
                      />
                      <span className="text-xs text-muted-foreground shrink-0">원</span>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBudgetDialogOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={saveBudgets}>저장</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {budgetRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              아직 설정된 예산이 없어요. '예산 설정'을 눌러 시작해보세요!
            </p>
          ) : (
            <ul className="space-y-3">
              {budgetRows.map(({ category, budget, spent, ratio }) => {
                const pct = Math.min(ratio * 100, 100);
                const over = budget > 0 && spent > budget;
                const warn = budget > 0 && ratio >= 0.7 && !over;
                const barColor = over
                  ? "bg-destructive"
                  : warn
                    ? "bg-yellow-500"
                    : "bg-primary";
                const remaining = budget - spent;
                const color = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["기타"];
                return (
                  <li key={category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium px-2 py-0.5 rounded-full ${color}`}>
                        {category}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {won(spent)}{budget > 0 && ` / ${won(budget)}`}
                      </span>
                    </div>
                    {budget > 0 ? (
                      <>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p
                          className={`text-[11px] flex items-center gap-1 ${
                            over ? "text-destructive font-medium" : warn ? "text-yellow-700" : "text-muted-foreground"
                          }`}
                        >
                          {over && <AlertTriangle className="size-3" />}
                          {over
                            ? `예산 ${won(spent - budget)} 초과! (${Math.round(ratio * 100)}%)`
                            : `남은 금액: ${won(remaining)} (${Math.round(ratio * 100)}%)`}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">예산 미설정</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>


        {/* Monthly per-asset summary */}
        {monthByAsset.length > 0 && (
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-sm font-semibold">{monthLabel} 결제 수단별</h2>
              <span className="text-[11px] text-muted-foreground">{monthByAsset.length}개</span>
            </div>
            <ul className="divide-y">
              {monthByAsset.map(([asset, sum]) => (
                <li key={asset} className="flex items-center justify-between py-2 px-1">
                  <span className="text-sm">{asset}</span>
                  <span className="text-sm font-semibold tabular-nums">{won(sum)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}



        {/* Upload */}
        {draftList.length === 0 && (
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

        {/* Drafts */}
        {draftList.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="font-semibold">
                  AI 추출 결과 <span className="text-muted-foreground font-normal">({draftList.length}건)</span>
                </h2>
              </div>
              <button
                onClick={resetAll}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="전체 취소"
              >
                <X className="size-4" />
              </button>
            </div>

            {preview && (
              <div className="rounded-xl overflow-hidden border bg-muted max-h-40 flex items-center justify-center">
                <img src={preview} alt="업로드한 스크린샷" className="max-h-40 object-contain" />
              </div>
            )}

            {draftList.map((d, idx) => (
              <div key={d.id} className="rounded-2xl bg-card border p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  <button
                    onClick={() => removeDraft(d.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="이 항목 제거"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor={`merchant-${d.id}`} className="text-xs">사용처</Label>
                    <Input
                      id={`merchant-${d.id}`}
                      value={d.merchant}
                      onChange={(e) => updateDraft(d.id, { merchant: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`amount-${d.id}`} className="text-xs">금액 (원)</Label>
                    <Input
                      id={`amount-${d.id}`}
                      inputMode="numeric"
                      value={d.amount}
                      onChange={(e) => updateDraft(d.id, { amount: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`category-${d.id}`} className="text-xs">카테고리</Label>
                    <Select
                      value={d.category}
                      onValueChange={(v) => updateDraft(d.id, { category: v as Category })}
                    >
                      <SelectTrigger id={`category-${d.id}`} className="mt-1">
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
                    <Label htmlFor={`asset-${d.id}`} className="text-xs">결제 수단</Label>
                    <Select
                      value={ASSETS.includes(d.asset as Asset) ? d.asset : "__custom__"}
                      onValueChange={(v) =>
                        updateDraft(d.id, { asset: v === "__custom__" ? "" : v })
                      }
                    >
                      <SelectTrigger id={`asset-${d.id}`} className="mt-1">
                        <SelectValue placeholder="결제 수단 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSETS.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">직접 입력</SelectItem>
                      </SelectContent>
                    </Select>
                    {!ASSETS.includes(d.asset as Asset) && (
                      <Input
                        value={d.asset}
                        onChange={(e) => updateDraft(d.id, { asset: e.target.value })}
                        placeholder="예: 신한카드"
                        className="mt-2"
                      />
                    )}
                  </div>


                  <div className="col-span-2">
                    <Label htmlFor={`spent_at-${d.id}`} className="text-xs">결제일시</Label>
                    <Input
                      id={`spent_at-${d.id}`}
                      type="datetime-local"
                      value={d.spent_at}
                      onChange={(e) => updateDraft(d.id, { spent_at: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor={`memo-${d.id}`} className="text-xs">메모 (선택)</Label>
                    <Input
                      id={`memo-${d.id}`}
                      value={d.memo}
                      onChange={(e) => updateDraft(d.id, { memo: e.target.value })}
                      className="mt-1"
                      placeholder="예: 친구와 점심"
                    />
                  </div>
                </div>
              </div>
            ))}

            <label className="block rounded-xl border-2 border-dashed border-border bg-card text-center py-3 cursor-pointer hover:border-primary/50 transition text-sm text-muted-foreground">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
                disabled={analyzing}
              />
              <span className="inline-flex items-center gap-1.5">
                {analyzing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 분석 중...
                  </>
                ) : (
                  <>
                    <Plus className="size-4" /> 스크린샷 더 추가
                  </>
                )}
              </span>
            </label>

            <div className="flex gap-2 sticky bottom-3">
              <Button variant="outline" onClick={resetAll} className="flex-1">
                전체 취소
              </Button>
              <Button onClick={saveAll} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="size-4 animate-spin" /> : `${draftList.length}건 저장`}
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
                      {e.asset && (
                        <span className="mt-1 inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {e.asset}
                        </span>
                      )}
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
