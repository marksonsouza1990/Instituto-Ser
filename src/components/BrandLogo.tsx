import { useState } from 'react';

export const OFFICIAL_LOGO_SRC = '/assets/aistudio/WhatsApp_Image_2026-11-23_at_16.16.09_6ca89451.jpeg';

/**
 * Vetor fiel ao cata-vento de 4 cores da marca Instituto SER
 * (Azul #0E5A75, Amarelo #EBB428, Vermelho #BD4B22, Verde #6F873D).
 */
export function BrandLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Haste institucional */}
      <path d="M24 27V44" stroke="#144A47" strokeWidth="2.4" strokeLinecap="round" />

      {/* Traços de vento à esquerda e direita */}
      <path
        d="M4.5 29C7.5 30.8 10.8 31 14 29.8M5.5 32.5C8.2 33.9 11 34 13.5 33"
        stroke="#43A4BD"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M34 14.2C37.2 12.8 40.5 13 43.5 14.8M34.5 17.5C37.2 16.5 40 16.6 42.5 18"
        stroke="#43A4BD"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Pá Superior — Azul (#0E5A75) */}
      <path
        d="M24 23C19.5 19.5 19.2 10.5 26 4.5C28.8 10.2 28.5 18.2 24 23Z"
        fill="#0E5A75"
      />
      {/* Pá Direita — Amarelo (#EBB428) */}
      <path
        d="M24 23C27.5 18.5 36.5 18.2 42.5 25C36.8 27.8 28.8 27.5 24 23Z"
        fill="#EBB428"
      />
      {/* Pá Inferior — Vermelho (#BD4B22) */}
      <path
        d="M24 23C28.5 26.5 28.8 35.5 22 41.5C19.2 35.8 19.5 27.8 24 23Z"
        fill="#BD4B22"
      />
      {/* Pá Esquerda — Verde (#6F873D) */}
      <path
        d="M24 23C20.5 27.5 11.5 27.8 5.5 21C11.2 18.2 19.2 18.5 24 23Z"
        fill="#6F873D"
      />

      {/* Miolo central do cata-vento */}
      <circle cx="24" cy="23" r="2.7" fill="#F7F5F0" stroke="#144A47" strokeWidth="1" />
    </svg>
  );
}

/**
 * Faixa horizontal com as 4 cores institucionais da logomarca.
 */
export function BrandStrip({ className = 'h-[3px]' }: { className?: string }) {
  return (
    <div className={`w-full grid grid-cols-4 overflow-hidden ${className}`} aria-hidden="true">
      <div className="bg-[#0E5A75]" />
      <div className="bg-[#EBB428]" />
      <div className="bg-[#BD4B22]" />
      <div className="bg-[#6F873D]" />
    </div>
  );
}

/**
 * Exibe o logotipo oficial enviado pelo usuário com fallback vetorial seguro.
 */
export function OfficialLogoImage({ className = 'w-full h-auto' }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-[#F7F5F0] rounded-xl text-center">
        <BrandLogo className="w-24 h-24 mb-2" />
        <div className="text-[11px] font-display font-semibold tracking-[0.25em] text-[#144A47]">
          INSTITUTO
        </div>
        <div className="text-4xl font-display font-extrabold tracking-tight text-[#144A47] leading-none">
          SER
        </div>
        <div className="text-xs text-[#556262] mt-2">
          Vida em movimento. <span className="italic">Propósito em ação.</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={OFFICIAL_LOGO_SRC}
      alt="Logotipo oficial do Instituto SER — Vida em movimento. Propósito em ação."
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
