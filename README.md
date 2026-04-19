# Thai Bank Slip OCR Proof-of-Concept (POC)

A premium web application for extracting and calibrating data from Thai bank slips using multiple state-of-the-art AI OCR providers.

## 🚀 Overview

This tool allows users to upload Thai bank slip images and compare extraction results from various specialized OCR models. It includes a robust heuristic-based mapping system to handle diverse slip layouts and ensure accurate extraction of transaction details, sender/receiver names, and bank information.

## 🧠 Supported AI Providers & Models

| Provider | Model | Documentation & Reference |
| :--- | :--- | :--- |
| **Mistral AI** | `mistral-ocr-latest` | [Mistral OCR](https://mistral.ai/news/mistral-ocr) |
| **Qwen (Alibaba)** | `qwen-vl-ocr` | [Qwen-VL-OCR](https://www.qwencloud.com/models/qwen-vl-ocr) |
| **OpenTyphoon** | `typhoon-ocr-preview` | [Typhoon OCR](https://opentyphoon.ai/model/typhoon-ocr) |
| **Zhipu AI (GLM)** | `glm-ocr` | [GLM-OCR Repository](https://github.com/zai-org/GLM-OCR) |
| **OCR.space** | `Engine 2` | [OCR.space API](https://ocr.space/OCRAPI) |

## 🛠 Features

- **Multi-Provider Support**: Easily switch between AI models to compare accuracy.
- **Smart Data Calibration**: A dual-view interface showing both structured "Pre-filling" data and "Raw OCR" text.
- **Robust Thai Mapping**: Specialized logic to extract bank names, person names, and transaction IDs from complex Thai text.
- **Premium UI/UX**: Built with Framer Motion and Lucide icons for a sleek, responsive experience.

## ⚙️ Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- Yarn or NPM

### 2. Environment Variables
Create a `.env` file in the root directory and add your API keys:

```env
VITE_MISTRAL_API_KEY=your_mistral_key
VITE_GLM_API_KEY=your_glm_key
VITE_TYPHOON_API_KEY=your_typhoon_key
VITE_OCRSPACE_API_KEY=your_ocrspace_key
```

### 3. Install Dependencies
```bash
yarn install
# or
npm install
```

### 4. Run Development Server
```bash
yarn dev
# or
npm run dev
```

## 🏗 Technology Stack

- **Frontend**: React + Vite
- **Styling**: Vanilla CSS (Custom UI System)
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Language**: TypeScript

## 📄 License

MIT

## 🔗 Research & References

- **GLM-OCR**: [github.com/zai-org/GLM-OCR](https://github.com/zai-org/GLM-OCR)
- **Mistral OCR**: [mistral.ai/news/mistral-ocr](https://mistral.ai/news/mistral-ocr)
- **Typhoon OCR**: [opentyphoon.ai/model/typhoon-ocr](https://opentyphoon.ai/model/typhoon-ocr)
- **OCR.space**: [ocr.space/OCRAPI](https://ocr.space/OCRAPI)
- **Qwen-VL-OCR**: [qwencloud.com/models/qwen-vl-ocr](https://www.qwencloud.com/models/qwen-vl-ocr)
