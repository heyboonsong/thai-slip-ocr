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

export type Provider = 'mistral' | 'glm' | 'typhoon' | 'ocrspace';

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

    case 'mistral':
      return callMistral(apiKey, base64Content);
    case 'typhoon':
      return callTyphoon(apiKey, base64Content);
    case 'glm':
      return callGLM(apiKey, base64Content);
    case 'ocrspace':
      return callOCRSpace(apiKey, imageData);
    default:
      throw new Error(`Provider ${provider} not implemented`);
  }
}



async function callTyphoon(apiKey: string, base64: string): Promise<OCRResult> {
  const url = 'https://api.opentyphoon.ai/v1/ocr';
  
  // Convert base64 to Blob for multipart/form-data
  const responseBlob = await fetch(`data:image/jpeg;base64,${base64}`);
  const blob = await responseBlob.blob();

  const formData = new FormData();
  formData.append('file', blob, 'slip.jpg');
  formData.append('model', 'typhoon-ocr-preview');
  formData.append('task_type', 'default');
  formData.append('max_tokens', '16384');
  formData.append('temperature', '0.1');
  formData.append('top_p', '0.6');
  formData.append('repetition_penalty', '1.2');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  const data = await response.json();
  
  // Extract text from Typhoon OCR specialized response structure
  const pageResult = data.results?.[0];
  let text = '';
  
  if (pageResult?.success && pageResult?.message) {
    const content = pageResult.message.choices[0].message.content;
    try {
      // Try to parse as JSON if it's structured output
      const parsedContent = JSON.parse(content);
      text = parsedContent.natural_text || content;
    } catch (e) {
      text = content;
    }
  }

  // Extract using our central robust mapping function
  const result = extractThaiSlipData(text, data);
  
  // Custom logic for From/To sections if headers were detected
  const fromMatch = text.match(/#{1,6}\s*จาก\s*\n+([^\n]+)\n+([^\n]+)/i);
  if (fromMatch) {
    result.sender_name = fromMatch[1].replace(/[*#]/g, '').trim();
    result.sender_bank = fromMatch[2].replace(/[*#]/g, '').trim();
  }
  const toMatch = text.match(/#{1,6}\s*ไปยัง\s*\n+([^\n]+)\n+([^\n]+)/i);
  if (toMatch) {
    result.receiver_name = toMatch[1].replace(/[*#]/g, '').trim();
    result.receiver_bank = toMatch[2].replace(/[*#]/g, '').trim();
  }

  return result;
}

async function callMistral(apiKey: string, base64: string): Promise<OCRResult> {
  const url = 'https://api.mistral.ai/v1/ocr';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: `data:image/jpeg;base64,${base64}`
      },
      include_image_base64: true
    })
  });

  const data = await response.json();
  const text = data.pages?.map((p: any) => p.markdown).join('\n') || '';
  return { ...extractThaiSlipData(text, data), raw_data: JSON.stringify(data, null, 2) };
}


async function callGLM(apiKey: string, base64: string): Promise<OCRResult> {
  const url = 'https://api.z.ai/api/paas/v4/layout_parsing';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'glm-ocr',
      file: `data:image/png;base64,${base64}`,
    })
  });

  const data = await response.json();
  const contents = data.layout_details?.[0]?.map((item: any) => item.content) || [];
  const fullText = data.md_results || contents.join('\n');

  const result = extractThaiSlipData(fullText, data);

  // Still use layout_details indices for GLM specifically if we found enough lines
  if (!result.sender_name && contents.length >= 7) {
    result.sender_name = contents[4] || '';
    result.sender_bank = contents[5] || '';
    result.receiver_name = contents[9] || contents[7] || '';
    result.receiver_bank = contents[10] || contents[8] || '';
  }

  return result;
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
  
  return extractThaiSlipData(text, data);
}

/**
 * Shared robust extraction logic for Thai Bank Slips
 */
function extractThaiSlipData(text: string, rawData: any): OCRResult {
  let sender_name = '';
  let sender_bank = '';
  let receiver_name = '';
  let receiver_bank = '';

  const clean = (s: string) => s.replace(/[*#]/g, '').trim();
  const isDate = (str: string) => /(\d{1,2}\s+[\u0E00-\u0E7F.]+\s+\d{2,4})|(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{2,4})|(\d{1,2}[:.]\d{2})/.test(str);
  const isAmount = (str: string) => /[\d,]+\.\d{2}/.test(str);
  const isBank = (str: string) => /(ธนาคาร|ธ\.|Prompt\s*Pay|Pay|K\+|KBank|SCB|BBL|KTB|BAY|TTB|TMB|GSB|BAAC|Method|รหัสพร้อมเพย์|Prompt)/i.test(str);
  const isName = (str: string) => {
    const s = clean(str);
    if (!s || s.length < 4 || isBank(s) || isDate(s) || isAmount(s) || s.includes('XXX') || s.includes('รายการ')) return false;
    return /^(นาย|นาง|น\.ส\.|บริษัท|หจก\.|Mr\.|Mrs\.|Ms\.)/i.test(s) || (s.split(' ').length >= 2 && s.length > 5);
  };

  // 1. Block-based extraction (Markdown or Multi-line sections)
  const sections = text.split(/\n?#{1,6}\s+/).map(s => s.trim()).filter(s => s !== '');
  const relevantSections = sections.filter(s => {
    const firstLine = s.split('\n')[0].toLowerCase();
    return !['โอนเงินสำเร็จ', 'transfer successful'].includes(firstLine) || s.includes('XXX');
  });

  if (relevantSections.length >= 2) {
    relevantSections.forEach((section, i) => {
      const lines = section.split('\n').map(l => l.trim()).filter(l => l !== '');
      let name = '';
      let bank = '';
      for (const line of lines.slice(0, 5)) {
        if (!name && isName(line)) name = line;
        else if (!bank && isBank(line)) bank = line;
      }
      if (!name && lines[1] && !isAmount(lines[1])) name = lines[1];
      if (!bank) bank = lines[0];

      if (i === 0) { sender_name = name; sender_bank = bank; }
      else if (i > 0 && !receiver_name) { receiver_name = name; receiver_bank = bank; }
    });
  } else {
    // 2. Fallback for plain text (OCR Space style) - Proximity-based detection
    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    const foundNames: { val: string; idx: number }[] = [];
    const foundBanks: { val: string; idx: number }[] = [];

    lines.forEach((line, idx) => {
      if (isName(line)) foundNames.push({ val: line, idx });
      if (isBank(line)) foundBanks.push({ val: line, idx });
    });

    if (foundNames.length >= 1) {
      sender_name = foundNames[0].val;
      // Pair with the first bank found at or after the name's position
      sender_bank = foundBanks.find(b => b.idx >= foundNames[0].idx)?.val || foundBanks[0]?.val || '';
    }
    if (foundNames.length >= 2) {
      receiver_name = foundNames[foundNames.length - 1].val;
      // Pair with the first bank found at or after the receiver name's position
      receiver_bank = foundBanks.find(b => b.idx >= foundNames[foundNames.length - 1].idx)?.val || foundBanks[foundBanks.length - 1]?.val || '';
    } else if (foundNames.length === 1 && foundBanks.length >= 2) {
      // If only one name found but multiple banks, second bank is likely receiver_bank
      receiver_bank = foundBanks[foundBanks.length - 1].val;
    }
  }

  return {
    transaction_id: text.match(/(?:รหัสอ้างอิง|รายการ:|Ref(?:\.\s*no\.)?|Reference\s*no\.?)\s*[:-\s|]*([A-Za-z0-9]{4,25})/i)?.[1] || '',
    amount: text.match(/(?:จำนวนเงิน|จำนวน|Amount|Total):\s*[:-\s|]*([\d,]+\.\d{2})/i)?.[1]?.replace(/,/g, '') || 
            text.match(/([\d,]+\.\d{2})\s*(?:บาท|THB)/i)?.[1]?.replace(/,/g, '') ||
            text.match(/^\s*([\d,]+\.\d{2})\s*$/m)?.[1]?.replace(/,/g, '') || '',
    date: text.match(/(\d{1,2}\s+[\u0E00-\u0E7F.]+\s+\d{2,4})/)?.[1] || 
          text.match(/(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{2,4})/)?.[1] || '',
    time: text.match(/(\d{1,2}[:.]\d{2}(?:\s*[AP]M)?)/i)?.[1]?.replace('.', ':') || '',
    sender_bank: clean(sender_bank),
    sender_name: clean(sender_name),
    receiver_bank: clean(receiver_bank),
    receiver_name: clean(receiver_name),
    raw_data: text
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
