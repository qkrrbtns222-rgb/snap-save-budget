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

    const systemPrompt = `당신은 한국 결제 영수증/문자/은행앱 스크린샷을 분석하는 전문가입니다.
이미지에서 다음 정보를 정확히 추출하세요:
- 결제일시 (날짜와 시간, ISO 8601 형식)
- 가맹점/사용처 (브랜드명만 간결하게)
- 결제 금액 (쉼표, '원' 제거한 순수 정수)
- 카테고리 (다음 중 하나: ${CATEGORIES.join(", ")})

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
              { type: "text", text: "이 결제 스크린샷에서 정보를 추출해주세요." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_expense",
              description: "결제 정보 추출",
              parameters: {
                type: "object",
                properties: {
                  spent_at: {
                    type: "string",
                    description: "결제일시. ISO 8601 (예: 2025-06-01T14:30:00). 시간 미상이면 00:00:00, 날짜 미상이면 오늘 날짜.",
                  },
                  merchant: { type: "string", description: "가맹점명/사용처" },
                  amount: { type: "integer", description: "금액 (정수, 원화)" },
                  category: { type: "string", enum: [...CATEGORIES] },
                  confidence: { type: "number", description: "추출 신뢰도 0~1" },
                },
                required: ["spent_at", "merchant", "amount", "category"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_expense" } },
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
    return {
      spent_at: String(args.spent_at),
      merchant: String(args.merchant),
      amount: Number(args.amount),
      category: String(args.category),
      confidence: typeof args.confidence === "number" ? args.confidence : null,
    };
  });
