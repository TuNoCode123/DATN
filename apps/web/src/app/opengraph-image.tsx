import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NEU Study — AI-Powered IELTS, TOEIC & HSK Exam Prep';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          backgroundColor: '#FFF8F0',
          backgroundImage:
            'radial-gradient(circle at 25% 0%, #DCFCE7 0%, transparent 50%), radial-gradient(circle at 100% 100%, #DBEAFE 0%, transparent 50%)',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '16px',
              backgroundColor: '#22C55E',
              border: '4px solid #1E293B',
              boxShadow: '6px 6px 0 #1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              fontWeight: 900,
              color: 'white',
            }}
          >
            N
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 800,
              color: '#1E293B',
              letterSpacing: '-0.02em',
            }}
          >
            NEU Study
          </div>
        </div>
        <div
          style={{
            fontSize: '76px',
            fontWeight: 800,
            color: '#1E293B',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            maxWidth: '1000px',
            display: 'flex',
            flexWrap: 'wrap',
          }}
        >
          Ace Any Language Exam with{' '}
          <span style={{ color: '#22C55E', fontStyle: 'italic' }}>&nbsp;AI</span>
        </div>
        <div
          style={{
            fontSize: '32px',
            color: '#64748B',
            marginTop: '32px',
            fontWeight: 500,
          }}
        >
          IELTS · TOEIC · HSK · Practice Tests · Smart Flashcards
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            right: '80px',
            fontSize: '24px',
            color: '#22C55E',
            fontWeight: 700,
          }}
        >
          web.neu-study.online
        </div>
      </div>
    ),
    { ...size },
  );
}
