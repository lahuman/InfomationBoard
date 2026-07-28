import type { BoardDraft, BoardTemplate } from "./schema";

export type BoardTemplateDefinition = {
  id: BoardTemplate;
  label: string;
  eyebrow: string;
  description: string;
  defaults: BoardDraft;
};

export const BOARD_TEMPLATES = {
  store: {
    id: "store",
    label: "매장 안내",
    eyebrow: "STORE",
    description: "영업시간, 위치, 이용 방법을 한눈에 안내합니다.",
    defaults: {
      title: "우리 매장 안내",
      summary: "방문 전에 필요한 정보를 확인해 주세요.",
      contentMarkdown: `## 영업시간

- 평일: 09:00–18:00
- 주말 및 공휴일: 휴무

## 오시는 길

주소와 대중교통 이용 방법을 적어 주세요.

## 이용 안내

방문객이 미리 알아야 할 내용을 적어 주세요.`,
      template: "store",
      theme: {
        palette: "lime",
        density: "comfortable",
        alignment: "left",
      },
    },
  },
  event: {
    id: "event",
    label: "행사 안내",
    eyebrow: "EVENT",
    description: "날짜, 장소, 프로그램을 선명한 포스터로 구성합니다.",
    defaults: {
      title: "새로운 행사",
      summary: "행사의 핵심 내용을 한 문장으로 소개해 주세요.",
      contentMarkdown: `## 일정

- 날짜: 2026년 8월 1일
- 시간: 오후 2시

## 장소

행사 장소와 찾아오는 방법을 적어 주세요.

## 프로그램

1. 시작 및 안내
2. 주요 프로그램
3. 마무리`,
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
    },
  },
  meeting: {
    id: "meeting",
    label: "모임 안내",
    eyebrow: "MEETING",
    description: "목적, 안건, 준비물을 빠짐없이 공유합니다.",
    defaults: {
      title: "새로운 모임",
      summary: "함께 모이는 목적을 소개해 주세요.",
      contentMarkdown: `## 모임 목적

이번 모임에서 함께 나눌 내용을 적어 주세요.

## 안건

- 첫 번째 안건
- 두 번째 안건

## 준비물

참여 전에 준비해야 할 내용을 적어 주세요.`,
      template: "meeting",
      theme: {
        palette: "blue",
        density: "compact",
        alignment: "left",
      },
    },
  },
} satisfies Record<BoardTemplate, BoardTemplateDefinition>;

export function getBoardTemplate(
  template: BoardTemplate,
): BoardTemplateDefinition {
  return BOARD_TEMPLATES[template];
}

