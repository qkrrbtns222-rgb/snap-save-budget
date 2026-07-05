import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageDataUrl: z.string().min(20).max(15_000_000),
});

const CATEGORIES = ["식비", "카페", "교통", "쇼핑", "의료", "생활", "문화/여가", "주거/통신", "기타"] as const;

export const analyzeReceipt = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY가 설정되어 있지 않습니다.");

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const dayBefore = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
    const dayBeforeStr = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, "0")}-${String(dayBefore.getDate()).padStart(2, "0")}`;
    const systemPrompt = `당신은 한국 결제 영수증/문자/은행앱 스크린샷을 분석하는 전문가입니다.
오늘 날짜는 ${todayStr} 입니다. 이미지에 연도가 표시되지 않은 경우 반드시 올해(${today.getFullYear()})를 사용하세요. 미래 날짜가 되면 작년을 사용하세요.
**상대 날짜 처리 (매우 중요):** 이미지에 "오늘"이라고 표시되면 ${todayStr}, "어제"는 ${yesterdayStr}, "그제/그저께"는 ${dayBeforeStr}로 반드시 절대 날짜로 변환하세요. 현대카드 등 앱은 "어제"라는 라벨을 자주 사용하는데, 이 경우 반드시 ${yesterdayStr}로 기록해야 합니다. 절대 오늘 날짜로 기록하지 마세요.
이미지에 **여러 건의 결제 내역**이 포함될 수 있습니다 (예: 거래내역 목록, 여러 영수증을 한 장에 모은 사진 등).
각 결제 건마다 다음 정보를 추출해 배열로 반환하세요:
- 결제일시 (날짜와 시간, ISO 8601 형식). 날짜 정보가 전혀 없으면 오늘(${todayStr})을 사용하세요. "어제"는 ${yesterdayStr}로, "그제"는 ${dayBeforeStr}로 변환합니다.
- 가맹점/사용처 (브랜드명만 간결하게)
- 결제 금액 (쉼표, '원' 제거한 순수 정수, 양수)
- 카테고리 (다음 중 하나: ${CATEGORIES.join(", ")})
- 결제 수단 (asset): 은행명/카드사/간편결제명 등 (예: 신한은행, 국민카드, 삼성카드, 카카오페이, 네이버페이, 토스, 현금). 이미지에서 확인되지 않으면 "기타".


규칙:
- 입금/환불/취소 항목은 제외하고, 출금/결제(지출) 건만 포함하세요.
- 동일 건이 중복으로 보여도 한 번만 추출하세요.
- 결제 건이 1건만 있으면 배열에 1개만 담아 반환하세요.
- 추출 가능한 결제 건이 전혀 없으면 빈 배열을 반환하세요.

카테고리 판단 기준:
- 식비: 식당, 배달, 편의점 음식, 마트 식료품
- 카페: 스타벅스, 이디야 등 카페/디저트
- 교통: 택시, 버스, 지하철, 주유, 주차
- 쇼핑: 의류, 온라인쇼핑, 백화점
- 의료: 병원, 약국
- 생활: 마트 생활용품, 미용
- 문화/여가: 영화, 공연, 게임, 도서
- 주거/통신: 월세, 관리비, 통신비, 공과금
- 기타: 분류 불가`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "이 스크린샷에서 모든 결제(지출) 내역을 빠짐없이 추출해주세요." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_expenses",
              description: "스크린샷에서 추출한 모든 결제 내역 목록",
              parameters: {
                type: "object",
                properties: {
                  expenses: {
                    type: "array",
                    description: "추출된 결제 건 목록 (0개 이상)",
                    items: {
                      type: "object",
                      properties: {
                        spent_at: {
                          type: "string",
                          description:
                            "결제일시. ISO 8601 (예: 2025-06-01T14:30:00). 시간 미상이면 00:00:00, 날짜 미상이면 오늘 날짜.",
                        },
                        merchant: { type: "string", description: "가맹점명/사용처" },
                        amount: { type: "integer", description: "금액 (양의 정수, 원화)" },
                        category: { type: "string", enum: [...CATEGORIES] },
                        asset: {
                          type: "string",
                          description: "결제 수단: 은행명/카드사/간편결제명 (예: 신한은행, 국민카드, 카카오페이, 현금). 불명 시 '기타'.",
                        },
                      },
                      required: ["spent_at", "merchant", "amount", "category", "asset"],
                      additionalProperties: false,

                    },
                  },
                },
                required: ["expenses"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_expenses" } },
      }),
    });

    if (response.status === 429) {
      throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    }
    if (response.status === 402) {
      throw new Error("AI 사용량이 소진되었습니다. 워크스페이스에 크레딧을 추가해주세요.");
    }
    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error("AI 분석에 실패했습니다.");
    }

    const json = await response.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI 응답에서 정보를 추출하지 못했습니다.");
    }
    const args = JSON.parse(toolCall.function.arguments);
    const rawList: unknown[] = Array.isArray(args.expenses) ? args.expenses : [];
    const expenses = rawList
      .map((it) => {
        const o = it as Record<string, unknown>;
        const amount = Number(o.amount);
        if (!o.merchant || !o.spent_at || !amount || amount <= 0) return null;
        return {
          spent_at: String(o.spent_at),
          merchant: String(o.merchant),
          amount,
          category: String(o.category ?? "기타"),
          asset: String(o.asset ?? "기타").trim() || "기타",
        };
      })
      .filter((x): x is { spent_at: string; merchant: string; amount: number; category: string; asset: string } => x !== null);

    return { expenses };
  });

