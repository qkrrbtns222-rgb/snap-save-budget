import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { Upload, Loader2, Trash2, Sparkles, Wallet, X, Plus, BarChart3, RotateCcw, Copy } from "lucide-react";
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
  const [quickText, setQuickText] = useState("");
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

  const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const currentYM = ymKey(new Date());
  const [selectedYM, setSelectedYM] = useState<string>(currentYM);

  const availableMonths = useMemo(() => {
    const set = new Set<string>([currentYM]);
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (!isNaN(d.getTime())) set.add(ymKey(d));
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [expenses, currentYM]);

  const [selY, selM] = useMemo(() => {
    const [y, m] = selectedYM.split("-").map(Number);
    return [y, m - 1];
  }, [selectedYM]);

  const monthLabel = useMemo(() => `${selY}년 ${selM + 1}월`, [selY, selM]);

  const monthTotal = useMemo(() => {
    return expenses
      .filter((e) => {
        const d = new Date(e.spent_at);
        return d.getFullYear() === selY && d.getMonth() === selM;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
  }, [expenses, selY, selM]);

  const monthByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== selY || d.getMonth() !== selM) continue;
      const key = e.asset || "기타";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses, selY, selM]);

  const monthByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of CATEGORIES) map.set(c, 0);
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== selY || d.getMonth() !== selM) continue;
      const key = (CATEGORIES as readonly string[]).includes(e.category) ? e.category : "기타";
      map.set(key, (map.get(key) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, selY, selM]);

  const dailySeries = useMemo(() => {
    const days = new Date(selY, selM + 1, 0).getDate();
    const arr = Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      label: `${i + 1}`,
      total: 0,
    }));
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== selY || d.getMonth() !== selM) continue;
      arr[d.getDate() - 1].total += Number(e.amount);
    }
    return arr;
  }, [expenses, selY, selM]);

  const dailyTotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of expenses) {
      const d = new Date(e.spent_at);
      if (d.getFullYear() !== selY || d.getMonth() !== selM) continue;
      map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [expenses, selY, selM]);

  const PIE_COLORS = [
    "hsl(220 90% 56%)",
    "hsl(25 95% 60%)",
    "hsl(45 95% 55%)",
    "hsl(330 80% 60%)",
    "hsl(160 70% 45%)",
    "hsl(280 70% 60%)",
    "hsl(195 80% 50%)",
    "hsl(0 75% 60%)",
    "hsl(220 10% 55%)",
  ];





  const parseQuickText = useCallback((raw: string): Draft | null => {
    const text = raw.trim();
    if (!text) return null;

    // 금액: "25,000원", "25000원", "2만원", "2.5만", "15천원"
    let amount = 0;
    let amountMatch: RegExpMatchArray | null = null;
    const manMatch = text.match(/(\d+(?:[.,]\d+)?)\s*만\s*원?/);
    const cheonMatch = text.match(/(\d+(?:[.,]\d+)?)\s*천\s*원?/);
    const plainMatch = text.match(/([\d,]+)\s*원/);
    const numOnly = text.match(/\b(\d{3,})\b/);
    if (manMatch) {
      amount = Math.round(Number(manMatch[1].replace(/,/g, "")) * 10000);
      amountMatch = manMatch;
    } else if (cheonMatch) {
      amount = Math.round(Number(cheonMatch[1].replace(/,/g, "")) * 1000);
      amountMatch = cheonMatch;
    } else if (plainMatch) {
      amount = Number(plainMatch[1].replace(/,/g, ""));
      amountMatch = plainMatch;
    } else if (numOnly) {
      amount = Number(numOnly[1]);
      amountMatch = numOnly;
    }
    if (!amount || amount <= 0) return null;

    // 카테고리
    let category: Category = "기타";
    for (const c of CATEGORIES) {
      if (text.includes(c)) {
        category = c;
        break;
      }
    }
    // 키워드 보강
    const keywordMap: Array<[RegExp, Category]> = [
      [/(스타벅스|커피|카페|이디야|투썸|메가|컴포즈)/, "카페"],
      [/(택시|버스|지하철|주유|기차|ktx|카카오t)/i, "교통"],
      [/(병원|약국|의원|치과)/, "의료"],
      [/(나이키|아디다스|쿠팡|무신사|쇼핑|백화점|올리브영)/, "쇼핑"],
      [/(영화|cgv|메가박스|공연|콘서트|넷플릭스)/i, "문화/여가"],
      [/(통신|관리비|월세|전기|수도|가스)/, "주거/통신"],
      [/(편의점|gs25|cu|세븐일레븐|이마트|홈플러스|마트|식당|배달|치킨|국밥|라면|김밥)/i, "식비"],
    ];
    if (category === "기타") {
      for (const [re, c] of keywordMap) {
        if (re.test(text)) {
          category = c;
          break;
        }
      }
    }

    // 결제수단
    let asset = "기타";
    for (const a of ASSETS) {
      if (text.includes(a)) {
        asset = a;
        break;
      }
    }

    // 사용처: 카테고리/금액/결제수단 토큰을 제거하고 남은 텍스트
    let rest = text;
    if (amountMatch) rest = rest.replace(amountMatch[0], " ");
    rest = rest.replace(category, " ");
    if (asset !== "기타") rest = rest.replace(asset, " ");
    rest = rest
      .replace(/[\/,·\-—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const merchant = rest || category;

    return {
      id: makeDraftId(),
      spent_at: toLocalInput(new Date().toISOString()),
      merchant,
      amount: String(amount),
      category,
      asset,
      memo: "",
    };
  }, []);

  const addQuickDraft = useCallback(() => {
    const draft = parseQuickText(quickText);
    if (!draft) {
      toast.error("금액을 인식하지 못했어요. 예: 식비 25000원 스타벅스");
      return;
    }
    setDraftList((prev) => [...prev, draft]);
    setQuickText("");
    toast.success("내역이 추가되었어요");
  }, [quickText, parseQuickText]);

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

  const resetAllExpenses = async () => {
    const { error } = await supabase.from("expenses").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error("초기화 실패: " + error.message);
    else {
      toast.success("모든 내역이 초기화되었습니다");
      loadExpenses();
    }
  };

  const buildExportText = () => {
    const ym = `${selY}년 ${selM + 1}월`;
    const monthExpenses = expenses.filter((e) => {
      const d = new Date(e.spent_at);
      return d.getFullYear() === selY && d.getMonth() === selM;
    });
    if (monthExpenses.length === 0) return "";
    const total = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const byCat = new Map<string, number>();
    monthExpenses.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + Number(e.amount)));
    const lines = [`📊 ${ym} 가계부`, `💰 총지출: ${won(total)} (${monthExpenses.length}건)`, ""];
    if (byCat.size > 0) {
      lines.push("📂 카테고리별");
      [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, v]) => lines.push(`  • ${c}: ${won(v)}`));
      lines.push("");
    }
    lines.push("📝 상세 내역");
    monthExpenses.forEach((e) => {
      const d = new Date(e.spent_at);
      const ds = `${d.getMonth() + 1}/${d.getDate()}`;
      const asset = e.asset ? ` [${e.asset}]` : "";
      lines.push(`  ${ds} ${e.category} ${e.merchant} ${won(Number(e.amount))}${asset}`);
    });
    return lines.join("\n");
  };

  const fallbackCopy = (text: string) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copyExportText = async () => {
    const text = buildExportText();
    if (!text) return toast.error("내보낼 내역이 없어요");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success("복사 완료! 카톡에 붙여넣으세요");
        return;
      }
      throw new Error("no clipboard");
    } catch {
      if (fallbackCopy(text)) {
        toast.success("복사 완료! 카톡에 붙여넣으세요");
      } else {
        // 마지막 폴백: 새 창에 텍스트 표시
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(`<pre style="white-space:pre-wrap;font-family:system-ui;padding:16px">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`);
          w.document.close();
          toast.success("새 창에서 내용을 길게 눌러 복사하세요");
        } else {
          toast.error("복사 실패 - 브라우저 권한을 확인하세요");
        }
      }
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

        {/* Month selector */}
        <div className="flex items-center gap-2 px-1">
          <Label className="text-xs text-muted-foreground">조회 월</Label>
          <Select value={selectedYM} onValueChange={setSelectedYM}>
            <SelectTrigger className="h-8 w-auto min-w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMonths.map((ym) => {
                const [y, m] = ym.split("-");
                return (
                  <SelectItem key={ym} value={ym}>
                    {y}년 {Number(m)}월
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Charts */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-3 px-1">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">{monthLabel} 일별 지출</h2>
          </div>
          {monthTotal === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              이번 달 지출 내역이 없어요
            </p>
          ) : (
            <div className="h-44 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    interval={Math.max(0, Math.floor(dailySeries.length / 8) - 1)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) =>
                      v >= 10000 ? `${Math.round(v / 1000) / 10}만` : v >= 1000 ? `${v / 1000}천` : String(v)
                    }
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number) => [won(v), "지출"]}
                    labelFormatter={(l) => `${l}일`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="total" fill="hsl(220 90% 56%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Category chart */}
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-3 px-1">
            <BarChart3 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">{monthLabel} 카테고리별 지출</h2>
          </div>
          {monthByCategory.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              이번 달 지출 내역이 없어요
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={monthByCategory}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={38}
                    paddingAngle={2}
                  >
                    {monthByCategory.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [won(v), n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
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

        {/* Quick add */}
        <section className="rounded-2xl bg-card border p-4 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Plus className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">텍스트로 빠르게 추가</h2>
          </div>
          <div className="flex gap-2">
            <Input
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addQuickDraft();
                }
              }}
              placeholder="예: 식비 25000원 스타벅스 / 쇼핑 50000원 나이키"
              className="flex-1"
            />
            <Button onClick={addQuickDraft} disabled={!quickText.trim()}>
              추가
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 px-1">
            카테고리·금액·사용처를 자유롭게 입력하세요. 추가된 내역은 아래 카드에서 수정 후 저장할 수 있어요.
          </p>
        </section>


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
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-semibold">
              최근 내역 <span className="text-xs text-muted-foreground font-normal">({expenses.length}건)</span>
            </h2>
            {expenses.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive">
                    <RotateCcw className="size-3.5" /> 전체 초기화
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>모든 지출 내역을 삭제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>
                      저장된 {expenses.length}건의 내역이 모두 삭제됩니다. 이 작업은 되돌릴 수 없어요.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={resetAllExpenses}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      전체 삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {expenses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={copyExportText}>
                <Copy className="size-3.5" /> {monthLabel} 텍스트 복사
              </Button>
            </div>
          )}
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
