// --- Types ---
export type OCRResult = {
  transaction_id: string;
  amount: number | string;
  date: string;
  time: string;
  sender_bank: string;
  sender_name: string;
  receiver_bank: string;
  receiver_name: string;
  raw_data?: string;
};

export type Provider = 'mistral' | 'glm' | 'typhoon' | 'qwen' | 'ocrspace';

type RawOCRResponse = {
  text: string;
  data: any;
  extra?: any;
};

// --- Constants & Regex ---
const REGEX = {
  TRANSACTION_ID: /(?:Reference(?:\s*No\.?)?|Ref(?:\.\s*No\.?)?|รหัสอ้างอิง|รหัสอาเจ็ง|รายการ:|Ref)\s*[:-\s|]*([A-Za-z0-9]{4,25})/i,
  AMOUNT: [
    /(?:จำนวนเงิน|จำนวน|Amount|Total):\s*[:-\s|]*([\d,]+\.\d{2})/i,
    /([\d,]+\.\d{2})\s*(?:บาท|THB)/i,
    /^\s*([\d,]+\.\d{2})\s*$/m
  ],
  DATE: [
    /(\d{1,2}\s+[\u0E00-\u0E7F.]+\s+\d{2,4})/,
    /(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{2,4})/
  ],
  TIME: [
    /(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i,
    /(\d{1,2}[:.]\d{2})\s*(?:$|\n)/,
    /-\s*(\d{1,2}[:.]\d{2})/
  ],
  BANK: /(ธนาคาร|ธ\.|Prompt\s*Pay|Pay|K\+|KBank|SCB|BBL|KTB|BAY|TTB|TMB|GSB|BAAC|Method|รหัสพร้อมเพย์|พร้อมเพย์|Prompt|กรุงไทย|กสิกร|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ทหารไทย|ออมสิน|ธ\.ก\.ส\.)/i,
  NAME_PREFIX: /^(นาย|นาง|น\.ส\.|บริษัท|หจก\.|Mr\.|Mrs\.|Ms\.)/i,
  EXCLUDE_WORDS: ['XXX', 'รายการ', 'รหัส', 'สำเร็จ']
};

// --- Pure Utility Functions ---
const pipe = <T>(...fns: Array<(arg: T) => T>) => (value: T) => fns.reduce((acc, fn) => fn(acc), value);

const clean = (s: string): string => s.replace(/[*#]/g, '').trim();
const isDate = (str: string): boolean => REGEX.DATE.some(r => r.test(str)) || /(\d{1,2}[:.]\d{2})/.test(str);
const isAmount = (str: string): boolean => /[\d,]+\.\d{2}/.test(str);
const isBank = (str: string): boolean => REGEX.BANK.test(str);
const isName = (str: string): boolean => {
  const s = clean(str);
  if (!s || s.length < 4 || isBank(s) || isDate(s) || isAmount(s) || REGEX.EXCLUDE_WORDS.some(w => s.includes(w))) return false;
  return REGEX.NAME_PREFIX.test(s) || (s.split(' ').length >= 2 && s.length > 5);
};

// --- Core Data Extraction (Pure Logic) ---
export const extractThaiSlipData = (text: string): OCRResult => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
  const sections = text.split(/\n?#{1,6}\s+/).map(s => s.trim()).filter(s => s !== '');
  
  let sender_name = '', sender_bank = '', receiver_name = '', receiver_bank = '';

  const relevantSections = sections.filter(s => !['โอนเงินสำเร็จ', 'transfer successful'].includes(s.split('\n')[0].toLowerCase()) || s.includes('XXX'));

  if (relevantSections.length >= 2) {
    relevantSections.forEach((section, i) => {
      const sLines = section.split('\n').map(l => l.trim());
      let name = '', bank = '';
      for (const line of sLines.slice(0, 5)) {
        if (!name && isName(line)) name = line;
        else if (!bank && isBank(line)) bank = line;
      }
      if (!name && sLines[1] && !isAmount(sLines[1])) name = sLines[1];
      if (!bank) bank = sLines[0];

      if (i === 0) { sender_name = name; sender_bank = bank; }
      else if (i > 0 && !receiver_name) { receiver_name = name; receiver_bank = bank; }
    });
  } else {
    const foundNames = lines.map((val, idx) => ({ val, idx })).filter(x => isName(x.val));
    const foundBanks = lines.map((val, idx) => ({ val, idx })).filter(x => isBank(x.val));

    if (foundNames[0]) {
      sender_name = foundNames[0].val;
      sender_bank = foundBanks.find(b => b.idx >= foundNames[0].idx)?.val || foundBanks[0]?.val || '';
    }
    if (foundNames.length >= 2) {
      receiver_name = foundNames[foundNames.length - 1].val;
      receiver_bank = foundBanks.find(b => b.idx >= foundNames[foundNames.length - 1].idx)?.val || foundBanks[foundBanks.length - 1]?.val || '';
    } else if (foundNames.length === 1 && foundBanks.length >= 2) {
      receiver_bank = foundBanks[foundBanks.length - 1].val;
    }
  }

  return {
    transaction_id: text.match(REGEX.TRANSACTION_ID)?.[1] || '',
    amount: (REGEX.AMOUNT.map(r => text.match(r)?.[1]).find(m => m) || '').replace(/,/g, ''),
    date: REGEX.DATE.map(r => text.match(r)?.[1]).find(m => m) || '',
    time: (REGEX.TIME.map(r => text.match(r)?.[1]).find(m => m) || '').replace('.', ':'),
    sender_bank: clean(sender_bank),
    sender_name: clean(sender_name),
    receiver_bank: clean(receiver_bank),
    receiver_name: clean(receiver_name),
    raw_data: text
  };
};

// --- Refinement Functions (Composability) ---
const withTyphoonRefinement = (res: OCRResult): OCRResult => {
  const text = res.raw_data || '';
  const fromMatch = text.match(/#{1,6}\s*จาก\s*\n+([^\n]+)\n+([^\n]+)/i);
  const toMatch = text.match(/#{1,6}\s*ไปยัง\s*\n+([^\n]+)\n+([^\n]+)/i);
  
  return {
    ...res,
    ...(fromMatch && { sender_name: clean(fromMatch[1]), sender_bank: clean(fromMatch[2]) }),
    ...(toMatch && { receiver_name: clean(toMatch[1]), receiver_bank: clean(toMatch[2]) })
  };
};

const withGLMRefinement = (contents: string[]) => (res: OCRResult): OCRResult => {
  if (res.sender_name || contents.length < 7) return res;
  return {
    ...res,
    sender_name: contents[4] || '',
    sender_bank: contents[5] || '',
    receiver_name: contents[9] || contents[7] || '',
    receiver_bank: contents[10] || contents[8] || ''
  };
};

// --- IO Handlers (Side Effects) ---
const IO = {
  mistral: async (key: string, base64: string): Promise<RawOCRResponse> => {
    const res = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'mistral-ocr-latest', document: { type: 'image_url', image_url: `data:image/jpeg;base64,${base64}` }, include_image_base64: true })
    });
    const data = await res.json();
    return { text: data.pages?.map((p: any) => p.markdown).join('\n') || '', data };
  },

  typhoon: async (key: string, base64: string): Promise<RawOCRResponse> => {
    const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob();
    const fd = new FormData();
    fd.append('file', blob, 'slip.jpg');
    fd.append('model', 'typhoon-ocr-preview');
    const res = await fetch('https://api.opentyphoon.ai/v1/ocr', { method: 'POST', headers: { 'Authorization': `Bearer ${key}` }, body: fd });
    const data = await res.json();
    const content = data.results?.[0]?.message?.choices?.[0]?.message?.content || '';
    let text = content;
    try { text = JSON.parse(content).natural_text || content; } catch (e) {}
    return { text, data };
  },

  glm: async (key: string, base64: string): Promise<RawOCRResponse> => {
    const res = await fetch('https://api.z.ai/api/paas/v4/layout_parsing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'glm-ocr', file: `data:image/png;base64,${base64}` })
    });
    const data = await res.json();
    const contents = data.layout_details?.[0]?.map((item: any) => item.content) || [];
    return { text: data.md_results || contents.join('\n'), data, extra: contents };
  },

  qwen: async (key: string, base64: string): Promise<RawOCRResponse> => {
    const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'qwen-vl-ocr',
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }, { type: 'text', text: 'Extract Thai bank slip text.' }]}]
      })
    });
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content || '', data };
  },

  ocrspace: async (key: string, base64: string): Promise<RawOCRResponse> => {
    const fd = new FormData();
    fd.append('base64image', `data:image/jpeg;base64,${base64}`); fd.append('language', 'tha'); fd.append('apikey', key); fd.append('OCREngine', '2');
    const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd });
    const data = await res.json();
    return { text: data.ParsedResults?.[0]?.ParsedText || '', data };
  }
};

// --- Pipeline Orchestrator ---
export async function performOCR(provider: Provider, imageData: string): Promise<OCRResult> {
  const apiKey = import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`];
  if (!apiKey) throw new Error(`API Key for ${provider} is missing`);

  const base64 = imageData.split(',')[1] || imageData;
  const { text, data, extra } = await IO[provider](apiKey, base64);
  
  const resultWithRaw = extractThaiSlipData(text);

  // Provider-specific composition
  const enhancers: Record<Provider, (res: OCRResult) => OCRResult> = {
    mistral: (r) => r,
    typhoon: withTyphoonRefinement,
    glm: withGLMRefinement(extra || []),
    qwen: (r) => r,
    ocrspace: (r) => r
  };

  return enhancers[provider](resultWithRaw);
}
