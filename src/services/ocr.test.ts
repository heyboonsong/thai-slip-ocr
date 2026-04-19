import { describe, it, expect } from 'vitest';
import { extractThaiSlipData } from './ocr';

describe('extractThaiSlipData', () => {
  it('should extract data correctly from Krungthai slip text', () => {
    const rawText = `Krungthai
กรุงไทย
โอนเงินสำเร็จ
รหัสอาเจ็ง A88f2091688f343ea
จาก
นายบุญสัง ศิษฐ์
กรุงไทย
XXX-X-XX415-0
ไปยัง
น.ส.ภักรวศิ พิมานเมขขนคร
พร้อมเพย์
XXX XXX 5740
จำนวนเงิน
2,642.00  บาท
ค่าธรรมเนียม
0.00 บาท
วันที่ชำระการ
07 ก.ค. 2568 - 12:10`;

    const result = extractThaiSlipData(rawText);

    expect(result.transaction_id).toBe('A88f2091688f343ea');
    expect(result.amount).toBe('2642.00');
    expect(result.sender_name).toBe('นายบุญสัง ศิษฐ์');
    expect(result.sender_bank).toBe('กรุงไทย');
    expect(result.receiver_name).toBe('น.ส.ภักรวศิ พิมานเมขขนคร');
    expect(result.receiver_bank).toBe('พร้อมเพย์');
    expect(result.date).toContain('07 ก.ค. 2568');
    expect(result.time).toBe('12:10');
  });

  it('should extract data from markdown-style sections (Typhoon/Mistral style)', () => {
    const rawText = `### โอนเงินสำเร็จ
รหัสอ้างอิง: 2024041912345678
**วันที่:** 19 เม.ย. 67, 13:45

# จาก
นายมานะ ใจดี
ธนาคารกสิกรไทย

# ไปยัง
นางสาวมานี มีทรัพย์
ธนาคารไทยพาณิชย์

### จำนวนเงิน
1,500.00 บาท`;

    const result = extractThaiSlipData(rawText);

    expect(result.transaction_id).toBe('2024041912345678');
    expect(result.amount).toBe('1500.00');
    expect(result.sender_name).toBe('นายมานะ ใจดี');
    expect(result.sender_bank).toBe('ธนาคารกสิกรไทย');
    expect(result.receiver_name).toBe('นางสาวมานี มีทรัพย์');
    expect(result.receiver_bank).toBe('ธนาคารไทยพาณิชย์');
  });

  it('should handle Ref ID with different labels', () => {
    const texts = [
      'รายการ: TXN789456',
      'Ref. no. 999888777',
      'Reference No: ABC123XYZ'
    ];

    expect(extractThaiSlipData(texts[0]).transaction_id).toBe('TXN789456');
    expect(extractThaiSlipData(texts[1]).transaction_id).toBe('999888777');
    expect(extractThaiSlipData(texts[2]).transaction_id).toBe('ABC123XYZ');
  });
});
