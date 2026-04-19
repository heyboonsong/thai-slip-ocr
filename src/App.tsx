import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Scan,
  CheckCircle,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import { performOCR, OCRResult, Provider } from "./services/ocr";

const INITIAL_DATA: OCRResult = {
  transaction_id: "",
  amount: "",
  date: "",
  time: "",
  sender_bank: "",
  sender_name: "",
  receiver_bank: "",
  receiver_name: "",
};

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>(() => {
    const saved = localStorage.getItem("selected_provider");
    return (saved as Provider) || "gemini";
  });
  const [data, setData] = useState<OCRResult>(INITIAL_DATA);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("selected_provider", provider);
  }, [provider]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const processOCR = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await performOCR(provider, image);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to process OCR");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof OCRResult, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="app">
      <header>
        <motion.h1
          className="title"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          MijPao OCR <span className="badge badge-new">POC</span>
        </motion.h1>
        <p className="subtitle">ระบบวิเคราะห์สลิปธนาคารด้วย AI</p>
      </header>

      <motion.div
        className="container"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1,
            },
          },
        }}
      >
        {/* Left Side: Upload & Preview */}
        <motion.section
          className="card"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <h2 style={{ marginBottom: "1.5rem" }}>อัปโหลดสลิป</h2>

          <div className="provider-chips">
            {(["gemini", "mistral", "typhoon", "glm", "ocrspace"] as Provider[]).map(
              (p) => (
                <button
                  key={p}
                  className={`chip ${provider === p ? "active" : ""}`}
                  onClick={() => setProvider(p)}
                >
                  {p === "glm" ? "GLM" : p === "ocrspace" ? "OCR Space" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ),
            )}
          </div>

          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              hidden
              accept="image/*"
              onChange={handleFileChange}
            />
            {image ? (
              <img src={image} alt="Slip preview" />
            ) : (
              <div className="upload-placeholder">
                <Upload
                  size={48}
                  color="var(--primary)"
                  style={{ marginBottom: "1rem" }}
                />
                <p>คลิกหรือลากไฟล์สลิปมาวางที่นี่</p>
                <p
                  style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}
                >
                  รองรับไฟล์ JPG, PNG
                </p>
              </div>
            )}
          </div>

          <button
            className="button"
            disabled={!image || loading}
            onClick={processOCR}
          >
            {loading ? <div className="loading-spinner" /> : <Scan size={20} />}
            {loading ? "กำลังประมวลผล..." : "ตรวจสอบสลิป"}
          </button>

          {error && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                marginTop: "1rem",
                color: "#c53030",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}
        </motion.section>

        {/* Right Side: Data Calibration */}
        <motion.section
          className="card"
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <h2>ปรับเทียบข้อมูล</h2>
            {data.transaction_id && (
              <CheckCircle color="var(--secondary)" size={24} />
            )}
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>จำนวนเงิน (บาท)</label>
              <input
                value={data.amount}
                onChange={(e) => handleInputChange("amount", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="input-group">
              <label>เลขที่รายการ (Ref ID)</label>
              <input
                value={data.transaction_id}
                onChange={(e) =>
                  handleInputChange("transaction_id", e.target.value)
                }
                placeholder="เลขที่อ้างอิง"
              />
            </div>
            <div className="input-group">
              <label>วันที่</label>
              <input
                value={data.date}
                onChange={(e) => handleInputChange("date", e.target.value)}
                placeholder="วว/ดด/ปปปป"
              />
            </div>
            <div className="input-group">
              <label>เวลา</label>
              <input
                value={data.time}
                onChange={(e) => handleInputChange("time", e.target.value)}
                placeholder="00:00"
              />
            </div>

            <div className="input-group full">
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--surface-highest)",
                  margin: "0.5rem 0",
                }}
              />
              <label>ข้อมูลผู้โอน</label>
            </div>

            <div className="input-group">
              <label>ธนาคาร</label>
              <input
                value={data.sender_bank}
                onChange={(e) =>
                  handleInputChange("sender_bank", e.target.value)
                }
                placeholder="ชื่อธนาคาร"
              />
            </div>
            <div className="input-group">
              <label>ชื่อผู้โอน</label>
              <input
                value={data.sender_name}
                onChange={(e) =>
                  handleInputChange("sender_name", e.target.value)
                }
                placeholder="ชื่อ-นามสกุล"
              />
            </div>

            <div className="input-group full">
              <hr
                style={{
                  border: "none",
                  borderTop: "1px solid var(--surface-highest)",
                  margin: "0.5rem 0",
                }}
              />
              <label>ข้อมูลผู้รับโอน</label>
            </div>

            <div className="input-group">
              <label>ธนาคาร</label>
              <input
                value={data.receiver_bank}
                onChange={(e) =>
                  handleInputChange("receiver_bank", e.target.value)
                }
                placeholder="ชื่อธนาคาร"
              />
            </div>
            <div className="input-group">
              <label>ชื่อผู้รับโอน</label>
              <input
                value={data.receiver_name}
                onChange={(e) =>
                  handleInputChange("receiver_name", e.target.value)
                }
                placeholder="ชื่อ-นามสกุล"
              />
            </div>
          </div>

          <div className="input-group full" style={{ marginTop: "1rem" }}>
            <label>Raw Data (JSON/Text)</label>
            <textarea
              readOnly
              value={data.raw_data || ""}
              style={{
                width: "100%",
                height: "120px",
                background: "var(--surface-low)",
                border: "1px solid var(--surface-highest)",
                borderRadius: "0.5rem",
                padding: "0.5rem",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                color: "var(--text-secondary)",
                resize: "vertical",
              }}
            />
          </div>

          <button
            className="button"
            style={{
              background: "var(--surface-low)",
              border: "1px solid var(--surface-highest)",
              color: "var(--text-primary)",
              height: "2.5rem",
              fontSize: "0.85rem",
              marginTop: "0.75rem",
            }}
            onClick={() => setData(INITIAL_DATA)}
          >
            <RefreshCcw size={14} />
            ล้างข้อมูล
          </button>
        </motion.section>
      </motion.div>
    </div>
  );
}
