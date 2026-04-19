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

export type Provider = 'gemini' | 'mistral' | 'deepseek' | 'typhoon' | 'ocrspace';

const SYSTEM_PROMPT = `You are a Thai bank slip OCR expert. 
Extract the following information from the bank slip image and return it as JSON:
- transaction_id: The reference number or transaction ID
- amount: Total amount transferred (number or string)
- date: Date of transaction (YYYY-MM-DD or as found)
- time: Time of transaction (HH:mm)
- sender_bank: Name of the sender's bank
- sender_name: Name of the sender
- receiver_bank: Name of the receiver's bank
- receiver_name: Name of the receiver

Return ONLY valid JSON. If a field is not found, use an empty string.`;

export async function performOCR(provider: Provider, imageData: string): Promise<OCRResult> {
  const apiKey = import.meta.env[`VITE_${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    throw new Error(`API Key for ${provider} is missing in .env`);
  }

  // Base64 data usually starts with "data:image/jpeg;base64,"
  const base64Content = imageData.split(',')[1] || imageData;

  switch (provider) {
    case 'gemini':
      return callGemini(apiKey, base64Content);
    case 'mistral':
      return callMistral(apiKey, base64Content);
    case 'typhoon':
      return callTyphoon(apiKey, base64Content);
    case 'deepseek':
      return callDeepseek(apiKey, base64Content);
    case 'ocrspace':
      return callOCRSpace(apiKey, imageData);
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}

async function callGemini(apiKey: string, base64: string): Promise<OCRResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { ...parseJSON(text), raw_data: JSON.stringify(data, null, 2) };
}

async function callTyphoon(apiKey: string, base64: string): Promise<OCRResult> {
  const url = 'https://api.opentyphoon.ai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'typhoon-v1.5x-70b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
          ]
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { ...parseJSON(text), raw_data: JSON.stringify(data, null, 2) };
}

async function callMistral(apiKey: string, base64: string): Promise<OCRResult> {
  // Mistral OCR usually returns markdown, but we can ask for JSON in the prompt
  // Note: Mistral's /v1/ocr is specialize, but /v1/chat/completions with pixtral works too.
  // We'll use the Chat API with vision support (pixtral-12b-2409) for JSON flexibility.
  const url = 'https://api.mistral.ai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'pixtral-12b-2409',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            { type: 'image_url', image_url: `data:image/jpeg;base64,${base64}` }
          ]
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { ...parseJSON(text), raw_data: JSON.stringify(data, null, 2) };
}

async function callDeepseek(apiKey: string, _base64: string): Promise<OCRResult> {
  // Deepseek currently doesn't have a public vision API in their main endpoint.
  // This is a placeholder for when they release it or if using a compatible shim.
  console.warn('Deepseek Vision API is not yet publicly available. Returning empty result.');
  return {
    transaction_id: 'NOT_SUPPORTED',
    amount: 0,
    date: '',
    time: '',
    sender_bank: '',
    sender_name: '',
    receiver_bank: '',
    receiver_name: ''
  };
}

async function callOCRSpace(apiKey: string, imageData: string): Promise<OCRResult> {
  const formData = new FormData();
  formData.append('base64image', imageData);
  formData.append('language', 'tha');
  formData.append('apikey', apiKey);
  formData.append('isOverlayRequired', 'true');
  formData.append('filetype', 'jpg');
  formData.append('OCREngine', '2');

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  const text = data.ParsedResults?.[0]?.ParsedText || '';
  const lines = text.split('\n').map((l: string) => l.trim());

  // Mapping logic based on Thai slip structure from OCR Space
  const findNextAfter = (marker: string) => {
    const idx = lines.findIndex((l: string) => l.includes(marker));
    return idx !== -1 && lines[idx + 1] ? lines[idx + 1] : '';
  };

  const dateTimeLine = lines[lines.length - 1] || '';
  const [dateStr, timeStr] = dateTimeLine.split('-').map((s: string) => s.trim());

  return {
    transaction_id: text.match(/รหัสอ้างอิง\s*([A-Za-z0-9]+)/)?.[1] || '',
    amount: text.match(/([\d,]+\.\d{2})\s*บาท/)?.[1] || '',
    date: dateStr || '',
    time: timeStr || '',
    sender_bank: findNextAfter('จาก') ? lines[lines.indexOf(findNextAfter('จาก')) + 1] : '',
    sender_name: findNextAfter('จาก'),
    receiver_bank: findNextAfter('ไปยัง') ? lines[lines.indexOf(findNextAfter('ไปยัง')) + 1] : '',
    receiver_name: findNextAfter('ไปยัง'),
    raw_data: JSON.stringify(data, null, 2)
  };
}

function parseJSON(text: string): OCRResult {
  try {
    // Remove markdown code blocks if present
    const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (e) {
    console.error('Failed to parse OCR result:', text);
    throw new Error('Could not parse OCR data from provider');
  }
}
