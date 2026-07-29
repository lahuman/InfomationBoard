import type { PublicBoard } from "../public/public-board";

export type SampleBoardSlug =
  | "cafe-guide"
  | "summer-festival"
  | "book-club";

export type SampleBoard = {
  number: "01" | "02" | "03";
  slug: SampleBoardSlug;
  label: string;
  description: string;
  board: PublicBoard;
};

const SAMPLE_TIMESTAMP = "2026-07-29T00:00:00.000Z";

export const SAMPLE_BOARDS = [
  {
    number: "01",
    slug: "cafe-guide",
    label: "매장 안내",
    description: "영업시간, 위치, 이용 방법을 한 화면에",
    board: {
      id: "40000000-0000-4000-8000-000000000001",
      slug: "cafe-guide",
      title: "파도책방 카페 이용 안내",
      summary: "책과 커피를 천천히 즐기는 작은 동네 공간입니다.",
      contentMarkdown: `## 영업시간

- 화–금: 11:00–20:00
- 토–일: 10:00–21:00
- 월요일: 정기 휴무

## 오시는 길

서울 마포구 성미산로 12길 8, 1층

홍대입구역 3번 출구에서 도보 8분 거리입니다.

## 이용 안내

- 모든 좌석에서 무료 Wi-Fi를 이용할 수 있습니다.
- 조용한 독서를 위해 통화는 입구 앞에서 부탁드립니다.
- 반려동물은 이동 가방 안에서 함께할 수 있습니다.

## 문의

[인스타그램에서 새 소식 보기](https://www.instagram.com/)`,
      template: "store",
      theme: {
        palette: "lime",
        density: "comfortable",
        alignment: "left",
      },
      allowIndexing: false,
      updatedAt: SAMPLE_TIMESTAMP,
      publishedAt: SAMPLE_TIMESTAMP,
    },
  },
  {
    number: "02",
    slug: "summer-festival",
    label: "행사 안내",
    description: "일정, 장소, 준비물을 강한 포스터로",
    board: {
      id: "40000000-0000-4000-8000-000000000002",
      slug: "summer-festival",
      title: "한강 여름 음악 축제",
      summary: "노을이 지는 강변에서 만나는 음악과 여름밤의 맛.",
      contentMarkdown: `## 일정과 장소

- 날짜: 2026년 8월 15일 토요일
- 시간: 오후 4시–9시
- 장소: 여의도 한강공원 물빛무대

## 프로그램

1. 16:00 로컬 마켓 오픈
2. 18:00 어쿠스틱 라이브
3. 20:00 여름밤 헤드라이너 공연

## 오시는 길

대중교통 이용을 권장합니다. 여의나루역 2번 출구에서 안내 표지를 따라오세요.

## 비가 올 때

우천 시 프로그램은 인근 실내 무대로 이동하며, 당일 정오에 안내판을 업데이트합니다.`,
      template: "event",
      theme: {
        palette: "coral",
        density: "comfortable",
        alignment: "left",
      },
      allowIndexing: false,
      updatedAt: SAMPLE_TIMESTAMP,
      publishedAt: SAMPLE_TIMESTAMP,
    },
  },
  {
    number: "03",
    slug: "book-club",
    label: "모임 안내",
    description: "참여자에게 필요한 내용을 빠짐없이",
    board: {
      id: "40000000-0000-4000-8000-000000000003",
      slug: "book-club",
      title: "퇴근 후 한 장 독서모임",
      summary:
        "읽은 문장 하나를 가져와 가볍게 이야기하는 저녁 모임입니다.",
      contentMarkdown: `## 이번 모임

- 일시: 2026년 8월 20일 목요일 오후 7시 30분
- 장소: 파도책방 커뮤니티 테이블
- 정원: 8명

## 함께 나눌 것

1. 이번 달에 발견한 문장 한 줄
2. 그 문장을 고른 이유
3. 다음 달에 함께 읽고 싶은 책

## 준비물

책 전체를 읽지 않아도 괜찮습니다. 나누고 싶은 문장과 편안한 마음만 준비해 주세요.

> 서로의 해석을 고치기보다 궁금해하고 질문합니다.`,
      template: "meeting",
      theme: {
        palette: "blue",
        density: "compact",
        alignment: "center",
      },
      allowIndexing: false,
      updatedAt: SAMPLE_TIMESTAMP,
      publishedAt: SAMPLE_TIMESTAMP,
    },
  },
] as const satisfies readonly SampleBoard[];

export const SAMPLE_BOARD_SLUGS = SAMPLE_BOARDS.map(({ slug }) => slug);

export function getSampleBoard(slug: string): SampleBoard | null {
  return SAMPLE_BOARDS.find((sample) => sample.slug === slug) ?? null;
}
