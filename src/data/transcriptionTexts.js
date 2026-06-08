// src/data/transcriptionTexts.js
// 필사(따라쓰기) 연습용 글 모음.
// ⚖️ 저작권: 전부 퍼블릭 도메인(속담·사자성어·고전·사망 70년 경과 시인) 또는
//    직접 작성/재화한 문장만 사용. 현대 저작물 원문은 포함하지 않음.
// 초등 5~6학년 수준 어휘 기준.

export const TRANSCRIPTION_CATEGORIES = [
  { id: "proverb", name: "속담", emoji: "💬" },
  { id: "idiom", name: "사자성어", emoji: "🀄" },
  { id: "quote", name: "위인의 말", emoji: "🌟" },
  { id: "poem", name: "시", emoji: "🌸" },
  { id: "fable", name: "이솝우화", emoji: "🦊" },
  { id: "classic", name: "고전의 지혜", emoji: "📜" },
  { id: "tale", name: "전래·고전 이야기", emoji: "🏮" },
  { id: "longread", name: "긴 글 한 편", emoji: "📖" },
];

// 각 글: { id, category, title, author, text }
// author 가 비어 있으면 작자 미상/전래.
export const TRANSCRIPTION_TEXTS = [
  // ───────────── 속담 (전래, 저작권 없음) ─────────────
  { id: "p01", category: "proverb", title: "속담", author: "", text: "가는 말이 고와야 오는 말이 곱다." },
  { id: "p02", category: "proverb", title: "속담", author: "", text: "천 리 길도 한 걸음부터." },
  { id: "p03", category: "proverb", title: "속담", author: "", text: "티끌 모아 태산." },
  { id: "p04", category: "proverb", title: "속담", author: "", text: "발 없는 말이 천 리 간다." },
  { id: "p05", category: "proverb", title: "속담", author: "", text: "낮말은 새가 듣고 밤말은 쥐가 듣는다." },
  { id: "p06", category: "proverb", title: "속담", author: "", text: "원숭이도 나무에서 떨어진다." },
  { id: "p07", category: "proverb", title: "속담", author: "", text: "백지장도 맞들면 낫다." },
  { id: "p08", category: "proverb", title: "속담", author: "", text: "콩 심은 데 콩 나고 팥 심은 데 팥 난다." },
  { id: "p09", category: "proverb", title: "속담", author: "", text: "호랑이도 제 말 하면 온다." },
  { id: "p10", category: "proverb", title: "속담", author: "", text: "등잔 밑이 어둡다." },
  { id: "p11", category: "proverb", title: "속담", author: "", text: "세 살 버릇 여든까지 간다." },
  { id: "p12", category: "proverb", title: "속담", author: "", text: "공든 탑이 무너지랴." },
  { id: "p13", category: "proverb", title: "속담", author: "", text: "우물을 파도 한 우물을 파라." },
  { id: "p14", category: "proverb", title: "속담", author: "", text: "바늘 도둑이 소도둑 된다." },
  { id: "p15", category: "proverb", title: "속담", author: "", text: "고생 끝에 낙이 온다." },
  { id: "p16", category: "proverb", title: "속담", author: "", text: "사공이 많으면 배가 산으로 간다." },
  { id: "p17", category: "proverb", title: "속담", author: "", text: "아니 땐 굴뚝에 연기 날까." },
  { id: "p18", category: "proverb", title: "속담", author: "", text: "쇠뿔도 단김에 빼라." },
  { id: "p19", category: "proverb", title: "속담", author: "", text: "가랑비에 옷 젖는 줄 모른다." },
  { id: "p20", category: "proverb", title: "속담", author: "", text: "윗물이 맑아야 아랫물이 맑다." },
  { id: "p21", category: "proverb", title: "속담", author: "", text: "말 한마디에 천 냥 빚도 갚는다." },
  { id: "p22", category: "proverb", title: "속담", author: "", text: "낫 놓고 기역 자도 모른다." },
  { id: "p23", category: "proverb", title: "속담", author: "", text: "구슬이 서 말이라도 꿰어야 보배." },
  { id: "p24", category: "proverb", title: "속담", author: "", text: "열 번 찍어 아니 넘어가는 나무 없다." },
  { id: "p25", category: "proverb", title: "속담", author: "", text: "급할수록 돌아가라." },
  { id: "p26", category: "proverb", title: "속담", author: "", text: "되로 주고 말로 받는다." },
  { id: "p27", category: "proverb", title: "속담", author: "", text: "지렁이도 밟으면 꿈틀한다." },
  { id: "p28", category: "proverb", title: "속담", author: "", text: "빈 수레가 요란하다." },
  { id: "p29", category: "proverb", title: "속담", author: "", text: "하늘은 스스로 돕는 자를 돕는다." },
  { id: "p30", category: "proverb", title: "속담", author: "", text: "작은 고추가 더 맵다." },

  // ───────────── 사자성어 + 뜻 (한자 성어, 풀이는 직접 작성) ─────────────
  { id: "i01", category: "idiom", title: "유비무환", author: "", text: "유비무환 — 미리 준비가 되어 있으면 걱정할 것이 없다." },
  { id: "i02", category: "idiom", title: "일석이조", author: "", text: "일석이조 — 한 가지 일로 두 가지 이익을 얻는다." },
  { id: "i03", category: "idiom", title: "대기만성", author: "", text: "대기만성 — 큰 그릇은 늦게 이루어진다." },
  { id: "i04", category: "idiom", title: "역지사지", author: "", text: "역지사지 — 처지를 바꾸어 상대의 마음을 헤아린다." },
  { id: "i05", category: "idiom", title: "유유상종", author: "", text: "유유상종 — 비슷한 사람끼리 서로 모인다." },
  { id: "i06", category: "idiom", title: "다다익선", author: "", text: "다다익선 — 많으면 많을수록 더욱 좋다." },
  { id: "i07", category: "idiom", title: "고진감래", author: "", text: "고진감래 — 쓴 것이 다하면 단 것이 온다." },
  { id: "i08", category: "idiom", title: "자업자득", author: "", text: "자업자득 — 자기가 한 일의 결과를 자기가 받는다." },
  { id: "i09", category: "idiom", title: "초지일관", author: "", text: "초지일관 — 처음 먹은 마음을 끝까지 밀고 나간다." },
  { id: "i10", category: "idiom", title: "동고동락", author: "", text: "동고동락 — 괴로움도 즐거움도 함께 나눈다." },
  { id: "i11", category: "idiom", title: "막상막하", author: "", text: "막상막하 — 실력이 비슷해 누가 위인지 가리기 어렵다." },
  { id: "i12", category: "idiom", title: "타산지석", author: "", text: "타산지석 — 다른 사람의 잘못도 나를 갈고닦는 거울이 된다." },
  { id: "i13", category: "idiom", title: "온고지신", author: "", text: "온고지신 — 옛것을 익혀 새것을 안다." },
  { id: "i14", category: "idiom", title: "백문불여일견", author: "", text: "백문불여일견 — 백 번 듣는 것이 한 번 보는 것만 못하다." },
  { id: "i15", category: "idiom", title: "유종의 미", author: "", text: "유종의 미 — 끝까지 잘 마무리하여 아름다움을 남긴다." },
  { id: "i16", category: "idiom", title: "근면성실", author: "", text: "근면성실 — 부지런하고 참되게 힘쓴다." },
  { id: "i17", category: "idiom", title: "권선징악", author: "", text: "권선징악 — 착한 일은 권하고 나쁜 일은 벌한다." },
  { id: "i18", category: "idiom", title: "안분지족", author: "", text: "안분지족 — 자기 처지에 만족하며 편안한 마음을 가진다." },
  { id: "i19", category: "idiom", title: "유언실행", author: "", text: "한 번 말한 것은 반드시 지켜 행한다." },
  { id: "i20", category: "idiom", title: "결초보은", author: "", text: "결초보은 — 죽어서도 잊지 않고 은혜를 갚는다." },

  // ───────────── 위인의 말 (짧은 격언, 직접 한국어로 옮김) ─────────────
  { id: "q01", category: "quote", title: "포기하지 마세요", author: "에디슨", text: "나는 실패한 적이 없다. 잘되지 않는 방법을 만 가지 찾아냈을 뿐이다." },
  { id: "q02", category: "quote", title: "오늘의 힘", author: "링컨", text: "오늘 할 수 있는 일을 내일로 미루지 말라." },
  { id: "q03", category: "quote", title: "함께", author: "헬렌 켈러", text: "혼자서는 할 수 있는 일이 적지만, 함께라면 많은 일을 할 수 있다." },
  { id: "q04", category: "quote", title: "꿈", author: "월트 디즈니", text: "꿈을 꿀 수 있다면, 그 꿈을 이룰 수도 있다." },
  { id: "q05", category: "quote", title: "용기", author: "마크 트웨인", text: "용기란 두려움이 없는 것이 아니라, 두려움을 이겨 내는 것이다." },
  { id: "q06", category: "quote", title: "배움", author: "간디", text: "내일 죽을 것처럼 살고, 영원히 살 것처럼 배우라." },
  { id: "q07", category: "quote", title: "시작", author: "", text: "시작이 반이다. 일단 첫걸음을 내디뎌라." },
  { id: "q08", category: "quote", title: "친절", author: "이솝", text: "아무리 작은 친절도 결코 헛되지 않다." },
  { id: "q09", category: "quote", title: "노력", author: "", text: "재능은 노력을 이기지 못하고, 노력은 즐기는 사람을 이기지 못한다." },
  { id: "q10", category: "quote", title: "정직", author: "", text: "정직은 가장 좋은 약속이며, 신뢰를 쌓는 첫걸음이다." },
  { id: "q11", category: "quote", title: "책", author: "", text: "좋은 책 한 권은 평생을 함께하는 가장 좋은 친구이다." },
  { id: "q12", category: "quote", title: "시간", author: "", text: "시간은 누구에게나 똑같이 주어지는 가장 공평한 선물이다." },
  { id: "q13", category: "quote", title: "실수", author: "", text: "실수는 부끄러운 것이 아니라, 다시 배우는 좋은 기회이다." },
  { id: "q14", category: "quote", title: "감사", author: "", text: "감사하는 마음은 작은 일도 큰 행복으로 바꾸어 준다." },
  { id: "q15", category: "quote", title: "도전", author: "", text: "넘어지는 것을 두려워하지 말고, 일어서지 않는 것을 두려워하라." },
  { id: "q16", category: "quote", title: "친구", author: "", text: "좋은 친구를 가지려면 먼저 좋은 친구가 되어야 한다." },
  { id: "q17", category: "quote", title: "꾸준함", author: "", text: "느려도 멈추지 않으면 언젠가 반드시 목적지에 닿는다." },
  { id: "q18", category: "quote", title: "겸손", author: "", text: "벼는 익을수록 고개를 숙인다. 배울수록 겸손해진다." },
  { id: "q19", category: "quote", title: "희망", author: "", text: "어두운 밤이 깊을수록 새벽은 가까이 와 있다." },
  { id: "q20", category: "quote", title: "성실", author: "", text: "오늘 흘린 땀방울은 내일의 든든한 밑거름이 된다." },

  // ───────────── 시 (퍼블릭 도메인: 사망 70년 경과 시인) ─────────────
  { id: "s01", category: "poem", title: "서시", author: "윤동주", text: "죽는 날까지 하늘을 우러러\n한 점 부끄럼이 없기를,\n잎새에 이는 바람에도\n나는 괴로워했다." },
  { id: "s02", category: "poem", title: "새로운 길", author: "윤동주", text: "내를 건너서 숲으로\n고개를 넘어서 마을로\n어제도 가고 오늘도 갈\n나의 길 새로운 길." },
  { id: "s03", category: "poem", title: "엄마야 누나야", author: "김소월", text: "엄마야 누나야 강변 살자.\n뜰에는 반짝이는 금모래빛,\n뒷문 밖에는 갈잎의 노래,\n엄마야 누나야 강변 살자." },
  { id: "s04", category: "poem", title: "먼 후일", author: "김소월", text: "먼 훗날 당신이 찾으시면\n그때에 내 말이 잊었노라.\n당신이 속으로 나무라면\n무척 그리다가 잊었노라." },
  { id: "s05", category: "poem", title: "진달래꽃", author: "김소월", text: "나 보기가 역겨워\n가실 때에는\n말없이 고이 보내 드리오리다." },
  { id: "s06", category: "poem", title: "산유화", author: "김소월", text: "산에는 꽃 피네\n꽃이 피네.\n갈 봄 여름 없이\n꽃이 피네." },
  { id: "s07", category: "poem", title: "호수", author: "정지용", text: "얼굴 하나야\n손바닥 둘로\n폭 가리지만,\n보고 싶은 마음\n호수만 하니\n눈 감을밖에." },
  { id: "s08", category: "poem", title: "청포도", author: "이육사", text: "내 고장 칠월은\n청포도가 익어 가는 시절.\n이 마을 전설이 주저리주저리 열리고\n먼 데 하늘이 꿈꾸며 알알이 들어와 박혀." },
  { id: "s09", category: "poem", title: "나룻배와 행인", author: "한용운", text: "나는 나룻배,\n당신은 행인.\n당신은 흙발로 나를 짓밟습니다." },
  { id: "s10", category: "poem", title: "광야", author: "이육사", text: "다시 천고의 뒤에\n백마 타고 오는 초인이 있어\n이 광야에서 목 놓아 부르게 하리라." },
  { id: "s11", category: "poem", title: "별 헤는 밤", author: "윤동주", text: "계절이 지나가는 하늘에는\n가을로 가득 차 있습니다.\n나는 아무 걱정도 없이\n가을 속의 별들을 다 헤일 듯합니다." },
  { id: "s12", category: "poem", title: "봄", author: "윤동주", text: "우리 애기는\n아래 발치에서 코올코올,\n고양이는\n부뚜막에서 가르랑가르랑." },
  { id: "s13", category: "poem", title: "빼앗긴 들에도 봄은 오는가", author: "이상화", text: "지금은 남의 땅,\n빼앗긴 들에도 봄은 오는가." },
  { id: "s14", category: "poem", title: "님의 침묵", author: "한용운", text: "님은 갔습니다.\n아아, 사랑하는 나의 님은 갔습니다." },
  { id: "s15", category: "poem", title: "오줌싸개 지도", author: "윤동주", text: "빨랫줄에 걸어 논\n요에다 그린 지도,\n지난밤에 내 동생\n오줌 싸 그린 지도." },

  // ───────────── 이솝우화 (고대, 직접 재화) ─────────────
  { id: "f01", category: "fable", title: "토끼와 거북이", author: "이솝", text: "꾸준히 걸은 거북이가, 잠든 토끼를 앞질러 결승점에 먼저 닿았습니다. 느려도 멈추지 않으면 이깁니다." },
  { id: "f02", category: "fable", title: "개미와 베짱이", author: "이솝", text: "여름내 노래만 부른 베짱이는 겨울에 굶주렸고, 부지런히 모은 개미는 따뜻하게 겨울을 났습니다." },
  { id: "f03", category: "fable", title: "여우와 신 포도", author: "이솝", text: "포도에 닿지 못한 여우는 \"저건 분명히 신 포도일 거야\" 하고 돌아섰습니다." },
  { id: "f04", category: "fable", title: "양치기 소년", author: "이솝", text: "거짓말로 자꾸 사람들을 속인 소년은, 정작 늑대가 왔을 때 아무도 믿어 주지 않았습니다." },
  { id: "f05", category: "fable", title: "해와 바람", author: "이솝", text: "거센 바람은 나그네의 외투를 벗기지 못했지만, 따뜻한 햇볕은 스스로 외투를 벗게 했습니다." },
  { id: "f06", category: "fable", title: "황금알을 낳는 거위", author: "이솝", text: "더 많은 황금을 욕심낸 주인은 거위의 배를 갈랐고, 결국 아무것도 얻지 못했습니다." },
  { id: "f07", category: "fable", title: "사자와 생쥐", author: "이솝", text: "작은 생쥐가 그물에 걸린 사자를 구해 주었습니다. 작은 친구도 큰 도움이 될 수 있습니다." },
  { id: "f08", category: "fable", title: "개와 그림자", author: "이솝", text: "물에 비친 자기 그림자의 고기를 탐낸 개는, 입에 문 고기마저 물에 떨어뜨리고 말았습니다." },
  { id: "f09", category: "fable", title: "황소와 개구리", author: "이솝", text: "황소만큼 커지려고 배를 부풀린 개구리는, 끝내 펑 터지고 말았습니다. 욕심은 화를 부릅니다." },
  { id: "f10", category: "fable", title: "여우와 두루미", author: "이솝", text: "납작한 접시와 목이 긴 병으로 서로를 골린 둘은, 남을 골리면 나도 골림을 당한다는 것을 배웠습니다." },
  { id: "f11", category: "fable", title: "금도끼 은도끼", author: "", text: "정직하게 \"제 도끼는 쇠도끼입니다\" 하고 답한 나무꾼은, 산신령에게 금도끼와 은도끼까지 받았습니다." },
  { id: "f12", category: "fable", title: "북풍과 나그네", author: "이솝", text: "강하게 밀어붙이기보다 따뜻하게 다가설 때 마음이 열립니다." },
  { id: "f13", category: "fable", title: "비둘기와 개미", author: "이솝", text: "개미가 물에 빠지자 비둘기가 나뭇잎을 떨어뜨려 구했고, 뒷날 개미도 비둘기를 구했습니다." },
  { id: "f14", category: "fable", title: "욕심 많은 개", author: "이솝", text: "가진 것에 만족하지 못하면, 가진 것마저 잃기 쉽습니다." },
  { id: "f15", category: "fable", title: "거북이의 교훈", author: "이솝", text: "재주를 믿고 게으름을 피우면, 느려도 성실한 사람에게 지고 맙니다." },

  // ───────────── 고전의 지혜 (논어·명심보감 등, 직접 옮김) ─────────────
  { id: "c01", category: "classic", title: "논어", author: "공자", text: "배우고 때때로 익히면, 또한 기쁘지 아니한가." },
  { id: "c02", category: "classic", title: "논어", author: "공자", text: "잘못을 하고도 고치지 않는 것, 그것을 진짜 잘못이라 한다." },
  { id: "c03", category: "classic", title: "논어", author: "공자", text: "아는 것을 안다 하고 모르는 것을 모른다 하는 것, 이것이 참으로 아는 것이다." },
  { id: "c04", category: "classic", title: "논어", author: "공자", text: "세 사람이 길을 가면 그중에 반드시 나의 스승이 있다." },
  { id: "c05", category: "classic", title: "논어", author: "공자", text: "남이 나를 알아주지 않음을 걱정하지 말고, 내가 남을 알지 못함을 걱정하라." },
  { id: "c06", category: "classic", title: "명심보감", author: "", text: "착한 일을 하는 사람에게는 하늘이 복으로 갚는다." },
  { id: "c07", category: "classic", title: "명심보감", author: "", text: "한때의 분함을 참으면, 백 날의 근심을 면한다." },
  { id: "c08", category: "classic", title: "명심보감", author: "", text: "남의 착한 점은 드러내고, 남의 잘못은 덮어 주라." },
  { id: "c09", category: "classic", title: "명심보감", author: "", text: "하루라도 착한 일을 생각하지 않으면, 온갖 나쁜 마음이 절로 일어난다." },
  { id: "c10", category: "classic", title: "채근담", author: "", text: "바쁠 때일수록 마음을 차분히 하고, 한가할 때일수록 마음을 깨어 있게 하라." },
  { id: "c11", category: "classic", title: "도산십이곡", author: "이황", text: "고인도 날 못 보고 나도 고인 못 봬, 고인을 못 봬도 가던 길 앞에 있네." },
  { id: "c12", category: "classic", title: "오우가", author: "윤선도", text: "내 벗이 몇이냐 하니 물과 돌과 소나무와 대나무라." },
  { id: "c13", category: "classic", title: "시조", author: "이방원", text: "이런들 어떠하며 저런들 어떠하리, 우리도 이같이 얽혀 백 년까지 누리리라." },
  { id: "c14", category: "classic", title: "시조", author: "정몽주", text: "이 몸이 죽고 죽어 일백 번 고쳐 죽어도, 임 향한 일편단심이야 가실 줄이 있으랴." },
  { id: "c15", category: "classic", title: "훈민정음 서문", author: "세종대왕", text: "나라의 말이 중국과 달라, 어리석은 백성이 말하고자 하여도 제 뜻을 펴지 못하는 이가 많다." },
  { id: "c16", category: "classic", title: "사자소학", author: "", text: "부모님이 부르시면 곧바로 대답하고, 시키시는 일은 게으르지 말라." },
  { id: "c17", category: "classic", title: "사자소학", author: "", text: "벗과 사귈 때에는 믿음으로써 하고, 서로 잘못은 바르게 일러 주라." },
  { id: "c18", category: "classic", title: "탈무드", author: "", text: "물고기 한 마리를 주면 하루를 살지만, 물고기 잡는 법을 알려 주면 평생을 산다." },
  { id: "c19", category: "classic", title: "명심보감", author: "", text: "배움은 늘 부족한 듯이 하고, 배운 것은 잃을까 두려워하듯 익혀라." },
  { id: "c20", category: "classic", title: "격언", author: "", text: "천 리 길도 한 걸음에서 시작되고, 큰 나무도 작은 씨앗에서 자란다." },

  // ───────────── 속담 추가 ─────────────
  { id: "p31", category: "proverb", title: "속담", author: "", text: "구르는 돌에는 이끼가 끼지 않는다." },
  { id: "p32", category: "proverb", title: "속담", author: "", text: "백 번 듣는 것이 한 번 보는 것만 못하다." },
  { id: "p33", category: "proverb", title: "속담", author: "", text: "남의 떡이 더 커 보인다." },
  { id: "p34", category: "proverb", title: "속담", author: "", text: "윗물이 흐리면 아랫물도 흐리다." },
  { id: "p35", category: "proverb", title: "속담", author: "", text: "가지 많은 나무에 바람 잘 날 없다." },
  { id: "p36", category: "proverb", title: "속담", author: "", text: "백지장도 맞들면 가볍다." },
  { id: "p37", category: "proverb", title: "속담", author: "", text: "돌다리도 두들겨 보고 건너라." },
  { id: "p38", category: "proverb", title: "속담", author: "", text: "뛰는 놈 위에 나는 놈 있다." },
  { id: "p39", category: "proverb", title: "속담", author: "", text: "고래 싸움에 새우 등 터진다." },
  { id: "p40", category: "proverb", title: "속담", author: "", text: "첫술에 배부르랴." },

  // ───────────── 사자성어 추가 ─────────────
  { id: "i21", category: "idiom", title: "주경야독", author: "", text: "주경야독 — 낮에는 일하고 밤에는 글을 읽으며 부지런히 배운다." },
  { id: "i22", category: "idiom", title: "형설지공", author: "", text: "형설지공 — 어려운 가운데에서도 부지런히 공부하여 이룬 보람." },
  { id: "i23", category: "idiom", title: "유아독존", author: "", text: "스스로를 귀하게 여기되, 남도 똑같이 귀하게 여겨야 한다." },
  { id: "i24", category: "idiom", title: "솔선수범", author: "", text: "솔선수범 — 남보다 앞장서서 모범을 보인다." },
  { id: "i25", category: "idiom", title: "일취월장", author: "", text: "일취월장 — 나날이 다달이 자라고 나아간다." },
  { id: "i26", category: "idiom", title: "상부상조", author: "", text: "상부상조 — 서로서로 돕고 거든다." },
  { id: "i27", category: "idiom", title: "정정당당", author: "", text: "정정당당 — 바르고 떳떳하게 겨룬다." },
  { id: "i28", category: "idiom", title: "백절불굴", author: "", text: "백절불굴 — 백 번 꺾여도 굽히지 않는다." },
  { id: "i29", category: "idiom", title: "유종지미", author: "", text: "끝을 잘 맺어야 시작도 빛난다." },
  { id: "i30", category: "idiom", title: "교학상장", author: "", text: "교학상장 — 가르치고 배우며 서로 함께 자란다." },

  // ───────────── 위인의 말 추가 ─────────────
  { id: "q21", category: "quote", title: "독서", author: "안중근", text: "하루라도 책을 읽지 않으면 입안에 가시가 돋는다." },
  { id: "q22", category: "quote", title: "정의", author: "", text: "옳은 일은 어렵더라도 하고, 그른 일은 쉽더라도 하지 말라." },
  { id: "q23", category: "quote", title: "끈기", author: "", text: "끝까지 해 보기 전에는 그것이 불가능한지 알 수 없다." },
  { id: "q24", category: "quote", title: "배려", author: "", text: "내가 받고 싶은 만큼 남에게도 친절을 베풀어라." },
  { id: "q25", category: "quote", title: "약속", author: "", text: "작은 약속이라도 지키는 사람이 큰일도 맡을 수 있다." },
  { id: "q26", category: "quote", title: "협동", author: "", text: "한 사람의 열 걸음보다 열 사람의 한 걸음이 멀리 간다." },
  { id: "q27", category: "quote", title: "정성", author: "", text: "지극한 정성은 마침내 돌도 뚫고 쇠도 녹인다." },
  { id: "q28", category: "quote", title: "배움의 길", author: "", text: "묻는 것을 부끄러워하지 않는 사람이 가장 빨리 배운다." },
  { id: "q29", category: "quote", title: "성장", author: "", text: "어제의 나보다 한 걸음 나아갔다면, 그것으로 충분하다." },
  { id: "q30", category: "quote", title: "마음", author: "", text: "고운 마음으로 한 일은 오래도록 좋은 향기를 남긴다." },

  // ───────────── 시 추가 (퍼블릭 도메인) ─────────────
  { id: "s16", category: "poem", title: "반딧불", author: "윤동주", text: "가자 가자 가자\n숲으로 가자\n달 조각을 주우러\n숲으로 가자." },
  { id: "s17", category: "poem", title: "굴뚝", author: "윤동주", text: "산골짜기 오막살이\n낮은 굴뚝엔\n몽기몽기 웨인 연기\n대낮에 솟나." },
  { id: "s18", category: "poem", title: "햇비", author: "윤동주", text: "아씨처럼 나린다\n보슬보슬 햇비\n맞아 주자 다 같이\n옥수숫대처럼 크게." },
  { id: "s19", category: "poem", title: "고향", author: "정지용", text: "고향에 고향에 돌아와도\n그리던 고향은 아니러뇨." },
  { id: "s20", category: "poem", title: "산 너머 저쪽", author: "", text: "산 너머 저쪽에는\n누가 사나.\n뻐꾸기 영 위에서\n한나절 울음 운다." },
  { id: "s21", category: "poem", title: "가는 길", author: "김소월", text: "그립다\n말을 할까\n하니 그리워.\n그냥 갈까\n그래도\n다시 더 한 번." },
  { id: "s22", category: "poem", title: "초혼", author: "김소월", text: "산산이 부서진 이름이여!\n허공중에 헤어진 이름이여!" },
  { id: "s23", category: "poem", title: "복종", author: "한용운", text: "남들이 자유를 사랑한다지마는\n나는 복종을 좋아하여요." },
  { id: "s24", category: "poem", title: "절정", author: "이육사", text: "매운 계절의 채찍에 갈겨\n마침내 북방으로 휩쓸려 오다." },
  { id: "s25", category: "poem", title: "꽃", author: "윤동주", text: "꽃이 피었다고 일러라.\n꽃이 졌다고 일러라." },

  // ───────────── 이솝우화 추가 ─────────────
  { id: "f16", category: "fable", title: "여우와 까마귀", author: "이솝", text: "까마귀는 여우의 달콤한 칭찬에 넘어가 입을 벌렸고, 물고 있던 치즈를 떨어뜨리고 말았습니다." },
  { id: "f17", category: "fable", title: "도시 쥐와 시골 쥐", author: "이솝", text: "화려해도 불안한 도시보다, 소박해도 마음 편한 시골이 낫다고 시골 쥐는 생각했습니다." },
  { id: "f18", category: "fable", title: "사자와 여우", author: "이솝", text: "남이 당한 일을 보고 미리 조심하는 사람은, 같은 함정에 빠지지 않습니다." },
  { id: "f19", category: "fable", title: "방울을 단 고양이", author: "이솝", text: "고양이 목에 방울을 달자는 좋은 생각도, 실제로 해낼 사람이 없으면 소용없습니다." },
  { id: "f20", category: "fable", title: "두 친구와 곰", author: "이솝", text: "위험이 닥치자 혼자 도망친 친구는, 참된 친구가 아니었습니다." },

  // ───────────── 고전의 지혜 추가 ─────────────
  { id: "c21", category: "classic", title: "논어", author: "공자", text: "아랫사람에게 묻는 것을 부끄러워하지 않는다." },
  { id: "c22", category: "classic", title: "맹자", author: "맹자", text: "하늘이 큰일을 맡기려 할 때에는, 먼저 그 마음과 몸을 단단히 단련시킨다." },
  { id: "c23", category: "classic", title: "명심보감", author: "", text: "은혜를 베풀거든 보답을 바라지 말고, 남에게 주었거든 후회하지 말라." },
  { id: "c24", category: "classic", title: "소학", author: "", text: "어른을 공경하고 어린이를 사랑하는 것이 사람의 도리이다." },
  { id: "c25", category: "classic", title: "격언", author: "", text: "부지런함은 값을 매길 수 없는 보배요, 조심함은 몸을 지키는 부적이다." },

  // ───────────── 전래·고전 이야기 (퍼블릭 도메인, 직접 재화) ─────────────
  { id: "t01", category: "tale", title: "흥부와 놀부", author: "", text: "제비의 부러진 다리를 정성껏 고쳐 준 흥부는, 이듬해 박씨 속에서 쏟아진 보물로 큰 복을 받았습니다." },
  { id: "t02", category: "tale", title: "심청전", author: "", text: "아버지의 눈을 뜨게 하려고 깊은 바다에 몸을 던진 심청은, 효심 덕분에 다시 살아나 왕비가 되었습니다." },
  { id: "t03", category: "tale", title: "별주부전", author: "", text: "꾀 많은 토끼는 \"간을 산속에 두고 왔다\"는 말로 용궁을 무사히 빠져나왔습니다." },
  { id: "t04", category: "tale", title: "콩쥐팥쥐", author: "", text: "착하고 부지런한 콩쥐는 두꺼비와 새들의 도움을 받아, 마침내 행복을 되찾았습니다." },
  { id: "t05", category: "tale", title: "해님 달님", author: "", text: "동아줄을 타고 하늘로 올라간 오누이는, 해와 달이 되어 온 세상을 환하게 비추었습니다." },
  { id: "t06", category: "tale", title: "견우와 직녀", author: "", text: "은하수에 가로막힌 견우와 직녀는, 칠월 칠석이면 까치가 놓아 준 다리에서 만났습니다." },
  { id: "t07", category: "tale", title: "의좋은 형제", author: "", text: "형은 동생을, 동생은 형을 생각하며 밤마다 볏단을 옮겨 놓았습니다. 서로를 아끼는 마음이 참 따뜻합니다." },
  { id: "t08", category: "tale", title: "단군 이야기", author: "", text: "곰은 쑥과 마늘을 먹으며 어둠을 견뎌 사람이 되었고, 그 끈기가 우리 겨레의 시작이 되었습니다." },
  { id: "t09", category: "tale", title: "토끼와 호랑이", author: "", text: "꾀 많은 토끼는 슬기로운 말로 사나운 호랑이의 위기를 번번이 넘겼습니다." },
  { id: "t10", category: "tale", title: "금도끼 은도끼", author: "", text: "정직하게 자기 도끼를 고른 나무꾼은 산신령에게 금도끼와 은도끼까지 상으로 받았습니다." },
  { id: "t11", category: "tale", title: "선녀와 나무꾼", author: "", text: "약속과 믿음이 흔들리자 행복도 함께 흩어졌습니다. 신뢰는 함께 사는 가장 큰 힘입니다." },
  { id: "t12", category: "tale", title: "혹부리 영감", author: "", text: "고운 노래로 도깨비를 즐겁게 한 영감은 혹을 떼었지만, 욕심을 부린 영감은 혹을 하나 더 붙였습니다." },

  // ───────────── 긴 글 한 편 (이솝우화·전래동화 직접 재화 / 시는 사후 70년 경과 퍼블릭 도메인) ─────────────
  { id: "L01", category: "longread", title: "토끼와 거북이", author: "이솝", text: "토끼와 거북이가 누가 더 빠른지 내기를 했습니다.\n토끼는 거북이를 한참 앞질러 놓고는, 느릿느릿 기어오는 거북이를 보며 마음을 놓았습니다.\n'저렇게 느린데 잠깐 쉬어도 되겠지.'\n토끼는 나무 그늘에서 그만 깜빡 잠이 들고 말았습니다.\n그동안 거북이는 쉬지 않고 한 걸음 한 걸음 나아갔습니다.\n토끼가 눈을 떴을 때, 거북이는 이미 결승선에 닿아 있었습니다.\n꾸준함이 재주를 이긴 날이었습니다." },
  { id: "L02", category: "longread", title: "개미와 베짱이", author: "이솝", text: "무더운 여름 내내 개미는 부지런히 먹이를 모았습니다.\n베짱이는 시원한 그늘에서 노래만 부르며 개미를 비웃었습니다.\n'더운데 뭐 하러 그렇게 일만 하니?'\n이윽고 찬바람이 부는 겨울이 왔습니다.\n먹을 것이 없어진 베짱이는 추위에 떨며 개미의 집을 찾아갔습니다.\n개미는 따뜻한 방으로 베짱이를 맞아 주었습니다.\n베짱이는 그제야 미리 준비하는 일의 소중함을 깨달았습니다." },
  { id: "L03", category: "longread", title: "북풍과 해님", author: "이솝", text: "북풍과 해님이 누가 더 힘이 센지 다투었습니다.\n마침 길을 가던 나그네를 보고, 둘은 누가 그의 외투를 벗기는지로 겨루기로 했습니다.\n북풍이 먼저 차가운 바람을 세차게 불었습니다.\n하지만 나그네는 외투를 더욱 단단히 여밀 뿐이었습니다.\n이번에는 해님이 따뜻한 햇살을 부드럽게 비추었습니다.\n땀이 난 나그네는 스스로 외투를 벗어 버렸습니다.\n다정함이 거센 힘보다 강하다는 것을 모두가 알게 되었습니다." },
  { id: "L04", category: "longread", title: "사자와 생쥐", author: "이솝", text: "잠자던 사자가 작은 생쥐를 발로 붙잡았습니다.\n'살려 주세요. 언젠가 꼭 은혜를 갚을게요.'\n사자는 코웃음을 쳤지만 생쥐를 놓아주었습니다.\n며칠 뒤, 사자가 사냥꾼의 그물에 걸려 꼼짝 못 하게 되었습니다.\n그 소리를 들은 생쥐가 달려와 날카로운 이로 그물을 갉아 끊었습니다.\n사자는 무사히 풀려났습니다.\n아무리 작은 친구라도 큰 도움이 될 수 있습니다." },
  { id: "L05", category: "longread", title: "양치기 소년", author: "이솝", text: "양을 치던 소년이 심심풀이로 거짓말을 했습니다.\n'늑대가 나타났어요!'\n마을 사람들이 헐레벌떡 달려왔지만 늑대는 없었습니다.\n소년은 사람들이 속는 모습이 재미있어 거짓말을 거듭했습니다.\n그러던 어느 날, 정말로 늑대가 나타났습니다.\n소년이 아무리 소리쳐도 이번에는 아무도 오지 않았습니다.\n거짓말은 끝내 자기 자신을 위험에 빠뜨렸습니다." },
  { id: "L06", category: "longread", title: "황금 알을 낳는 거위", author: "이솝", text: "한 농부에게 날마다 황금 알을 하나씩 낳는 거위가 있었습니다.\n농부는 점점 욕심이 생겼습니다.\n'저 배 속에는 황금이 가득 들어 있을 거야.'\n농부는 한꺼번에 부자가 되려고 거위의 배를 갈랐습니다.\n하지만 배 속에는 아무것도 없었습니다.\n거위는 죽고, 날마다 받던 황금 알마저 사라졌습니다.\n지나친 욕심은 가진 것까지 잃게 만듭니다." },
  { id: "L07", category: "longread", title: "흥부와 놀부", author: "전래동화", text: "마음씨 착한 흥부는 다리가 부러진 제비를 정성껏 치료해 주었습니다.\n이듬해 봄, 제비는 고마움의 뜻으로 박씨 하나를 물어다 주었습니다.\n흥부가 그 박을 톱으로 타자 금은보화가 쏟아져 나왔습니다.\n이 소식을 들은 욕심쟁이 놀부는 일부러 제비의 다리를 부러뜨렸습니다.\n놀부의 박에서는 도깨비가 나와 그를 호되게 혼내 주었습니다.\n착한 마음은 복으로, 모진 욕심은 벌로 돌아왔습니다." },
  { id: "L08", category: "longread", title: "해님 달님", author: "전래동화", text: "호랑이에게 어머니를 잃은 오누이가 집에 홀로 있었습니다.\n어머니인 척하며 찾아온 호랑이가 문을 열라고 했습니다.\n오누이는 뒷문으로 빠져나와 우물가 나무 위로 올라갔습니다.\n호랑이가 뒤쫓아 오자, 오누이는 하늘을 향해 빌었습니다.\n'우리를 살리시려거든 새 동아줄을 내려 주세요.'\n튼튼한 동아줄이 내려와 오누이는 하늘로 올라갔습니다.\n오누이는 해와 달이 되어 온 세상을 환하게 비추었습니다." },
  { id: "L09", category: "longread", title: "금도끼 은도끼", author: "전래동화", text: "나무꾼이 그만 도끼를 연못에 빠뜨리고 말았습니다.\n그가 슬퍼하자 산신령이 나타나 금도끼를 들어 보였습니다.\n'이것이 네 도끼냐?'\n'아닙니다. 제 도끼는 낡은 쇠도끼입니다.'\n나무꾼의 정직함에 감동한 산신령은 금도끼와 은도끼까지 모두 상으로 주었습니다.\n이 말을 들은 옆집 욕심쟁이는 일부러 도끼를 빠뜨리고 금도끼가 제 것이라 거짓말을 했습니다.\n산신령은 그에게 아무것도 주지 않고 사라졌습니다." },
  { id: "L10", category: "longread", title: "진달래꽃", author: "김소월", text: "나 보기가 역겨워\n가실 때에는\n말없이 고이 보내 드리오리다.\n\n영변에 약산\n진달래꽃\n아름 따다 가실 길에 뿌리오리다.\n\n가시는 걸음걸음\n놓인 그 꽃을\n사뿐히 즈려밟고 가시옵소서.\n\n나 보기가 역겨워\n가실 때에는\n죽어도 아니 눈물 흘리오리다." },
  { id: "L11", category: "longread", title: "서시", author: "윤동주", text: "죽는 날까지 하늘을 우러러\n한 점 부끄럼이 없기를,\n잎새에 이는 바람에도\n나는 괴로워했다.\n\n별을 노래하는 마음으로\n모든 죽어 가는 것을 사랑해야지\n그리고 나한테 주어진 길을\n걸어가야겠다.\n\n오늘 밤에도 별이 바람에 스치운다." },
  { id: "L12", category: "longread", title: "청포도", author: "이육사", text: "내 고장 칠월은\n청포도가 익어 가는 시절.\n\n이 마을 전설이 주저리주저리 열리고\n먼 데 하늘이 꿈꾸며 알알이 들어와 박혀.\n\n하늘 밑 푸른 바다가 가슴을 열고\n흰 돛단배가 곱게 밀려서 오면\n\n내가 바라는 손님은 고달픈 몸으로\n청포를 입고 찾아온다고 했으니\n\n내 그를 맞아 이 포도를 따 먹으면\n두 손은 함뿍 적셔도 좋으련.\n\n아이야 우리 식탁엔 은쟁반에\n하이얀 모시 수건을 마련해 두렴." },
];

export function getTranscriptionTexts(categoryId) {
  if (!categoryId || categoryId === "all") return TRANSCRIPTION_TEXTS;
  return TRANSCRIPTION_TEXTS.filter((t) => t.category === categoryId);
}

export function getTranscriptionById(id) {
  return TRANSCRIPTION_TEXTS.find((t) => t.id === id) || null;
}

export default TRANSCRIPTION_TEXTS;
