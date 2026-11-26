import { api } from '../api/client'
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Camera, Upload, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';
import PageTransition from '../components/shared/PageTransition';
import AnimatedSection from '../components/shared/AnimatedSection';

const labelStyle = { fontSize: 11, letterSpacing: '0.18em', color: '#9AAA9A', fontFamily: 'var(--font-jost)', fontWeight: 500 };
const cardStyle = { background: '#fff', border: '1px solid #E2E8E2', borderRadius: 18, boxShadow: '0 10px 30px -14px rgba(61,90,62,0.16)', padding: 28 };

const DIM_LABELS = {
  acne: 'Acne', redness: 'Redness', dark_spots: 'Dark Spots', texture: 'Texture', hydration: 'Hydration',
};

// For display: for "higher is worse" metrics we show the bar as the concern level.
function MetricBar({ dim, metric }) {
  const higherIsBetter = metric.higher_is_better;
  const score = metric.score;
  // colour: green when good, amber/red when concerning
  const good = higherIsBetter ? score >= 60 : score <= 40;
  const mid = higherIsBetter ? score >= 40 : score <= 60;
  const color = good ? '#3D5A3E' : mid ? '#C8A882' : '#C0392B';
  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-jost font-medium" style={{ fontSize: 13, color: '#1A1F1A' }}>{DIM_LABELS[dim] || dim}</span>
        <span className="font-jost capitalize" style={{ fontSize: 11, color }}>{metric.label}</span>
      </div>
      <div className="w-full h-[6px] rounded-full overflow-hidden" style={{ background: '#E2E8E2' }}>
        <motion.div className="h-full" style={{ background: color, borderRadius: 3 }}
          initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.7 }} />
      </div>
    </div>
  );
}

export default function SkinAnalysis() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [imageB64, setImageB64] = useState(null);
  const [result, setResult] = useState(null);

  const { data: history = [] } = useQuery({ queryKey: ['skinAnalyses'], queryFn: () => api.get('/api/skin-analysis') });
  const { data: comparison } = useQuery({ queryKey: ['skinAnalysisCompare'], queryFn: () => api.get('/api/skin-analysis/compare') });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setPreview(reader.result); setImageB64(reader.result); setResult(null); };
    reader.readAsDataURL(file);
  };

  const analyzeMutation = useMutation({
    mutationFn: () => api.post('/api/skin-analysis/analyze', { image_base64: imageB64 }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['skinAnalyses'] });
      queryClient.invalidateQueries({ queryKey: ['skinAnalysisCompare'] });
    },
  });

  return (
    <PageTransition>
      <div className="min-h-screen premium-bg p-6 md:p-8 lg:p-10">
        <AnimatedSection>
          <p className="font-jost font-medium uppercase mb-1" style={labelStyle}>AI Skin Analysis</p>
          <h1 className="font-cormorant font-semibold mb-2" style={{ fontSize: 40, color: '#1A1F1A', lineHeight: 1.2 }}>Photo Skin Analysis</h1>
          <p className="font-jost mb-6" style={{ fontSize: 14, color: '#5C6B5C' }}>
            Upload a clear, front-facing photo and our computer-vision model will score your visible skin concerns.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload card */}
          <AnimatedSection delay={0.05}>
            <div style={cardStyle}>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center cursor-pointer"
                style={{ border: '2px dashed #C9D6C9', borderRadius: 3, padding: 32, background: '#FAFBFA' }}
              >
                {preview ? (
                  <img src={preview} alt="preview" style={{ maxHeight: 240, borderRadius: 3, objectFit: 'contain' }} />
                ) : (
                  <>
                    <div className="w-14 h-14 flex items-center justify-center mb-3" style={{ background: '#E8EFE8', borderRadius: 3 }}>
                      <Camera className="w-6 h-6" style={{ color: '#3D5A3E' }} />
                    </div>
                    <p className="font-jost font-medium" style={{ fontSize: 14, color: '#1A1F1A' }}>Click to upload a photo</p>
                    <p className="font-jost" style={{ fontSize: 12, color: '#9AAA9A', marginTop: 4 }}>JPG or PNG, front-facing</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

              <div className="mt-4 flex gap-3">
                <button onClick={() => fileRef.current?.click()}
                  className="font-jost font-medium inline-flex items-center gap-2"
                  style={{ padding: '10px 18px', border: '1px solid #E2E8E2', borderRadius: 3, fontSize: 12, color: '#5C6B5C', background: '#fff' }}>
                  <Upload className="w-4 h-4" /> Choose Photo
                </button>
                <button onClick={() => analyzeMutation.mutate()} disabled={!imageB64 || analyzeMutation.isPending}
                  className="font-jost font-semibold tracking-[0.08em] uppercase text-xs text-white inline-flex items-center gap-2 disabled:opacity-50"
                  style={{ padding: '10px 22px', background: '#3D5A3E', borderRadius: 3 }}>
                  <Sparkles className="w-4 h-4" /> {analyzeMutation.isPending ? 'Analyzing...' : 'Analyze My Skin'}
                </button>
              </div>

              {analyzeMutation.isError && (
                <p className="font-jost mt-3" style={{ fontSize: 12, color: '#C0392B' }}>
                  {analyzeMutation.error?.message || 'Analysis failed. Is the CV service running?'}
                </p>
              )}

              <div className="mt-5 p-3" style={{ background: '#F7F7F5', borderRadius: 3 }}>
                <div className="flex items-center gap-2 mb-1">
                  <Info className="w-3.5 h-3.5" style={{ color: '#9AAA9A' }} />
                  <p className="font-jost font-semibold uppercase" style={{ fontSize: 10, color: '#9AAA9A', letterSpacing: '0.1em' }}>Photo guidelines</p>
                </div>
                <p className="font-jost" style={{ fontSize: 11, color: '#9AAA9A', lineHeight: 1.6 }}>
                  Use natural, even lighting · face the camera directly · remove makeup and glasses · no filters.
                </p>
              </div>
            </div>
          </AnimatedSection>

          {/* Results card */}
          <AnimatedSection delay={0.1}>
            <div style={cardStyle}>
              <h2 className="font-cormorant font-semibold mb-4" style={{ fontSize: 22, color: '#1A1F1A' }}>Analysis Results</h2>
              {result ? (
                <>
                  {result.face_detected === false && (
                    <div className="flex items-start gap-2 mb-4 p-3" style={{ background: '#FEF6F0', borderRadius: 3 }}>
                      <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: '#C97A40' }} />
                      <p className="font-jost" style={{ fontSize: 12, color: '#8A4B1E' }}>
                        No clear face detected — results may be less accurate. Try a brighter, front-facing photo.
                      </p>
                    </div>
                  )}
                  <div className="flex items-end gap-3 mb-5">
                    <span className="font-cormorant font-semibold" style={{ fontSize: 48, color: '#1A1F1A', lineHeight: 1 }}>
                      {result.overall_score}
                    </span>
                    <div className="mb-1">
                      <p className="font-jost" style={{ fontSize: 12, color: '#9AAA9A' }}>Overall skin score / 100</p>
                      <p className="font-jost" style={{ fontSize: 11, color: '#9AAA9A' }}>
                        {result.mode === 'cnn' ? 'CNN model' : 'Baseline analyzer'} · {Math.round((result.confidence || 0) * 100)}% confidence
                      </p>
                    </div>
                  </div>
                  {Object.entries(result.metrics || {}).map(([dim, metric]) => (
                    <MetricBar key={dim} dim={dim} metric={metric} />
                  ))}
                  <p className="font-jost mt-3" style={{ fontSize: 11, color: '#9AAA9A', fontStyle: 'italic' }}>{result.disclaimer}</p>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <div className="w-12 h-12 flex items-center justify-center mb-3" style={{ background: '#E8EFE8', borderRadius: 3 }}>
                    <Sparkles className="w-5 h-5" style={{ color: '#3D5A3E' }} />
                  </div>
                  <p className="font-jost" style={{ fontSize: 13, color: '#9AAA9A' }}>Upload a photo and hit analyze to see your scores.</p>
                </div>
              )}
            </div>
          </AnimatedSection>
        </div>

        {/* Progress comparison */}
        {comparison?.enough_data && (
          <AnimatedSection delay={0.15} className="mt-6">
            <div style={cardStyle}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" style={{ color: '#3D5A3E' }} />
                <h2 className="font-cormorant font-semibold" style={{ fontSize: 22, color: '#1A1F1A' }}>Progress Over Time</h2>
              </div>
              <p className="font-jost mb-4" style={{ fontSize: 12, color: '#9AAA9A' }}>
                Comparing your first analysis to your latest ({comparison.count} photos).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {comparison.deltas.map((d) => (
                  <div key={d.dimension} className="p-3" style={{ background: '#F7F7F5', borderRadius: 3 }}>
                    <p className="font-jost font-medium mb-1" style={{ fontSize: 12, color: '#1A1F1A' }}>{DIM_LABELS[d.dimension]}</p>
                    <div className="flex items-center gap-1">
                      {d.change === 0 ? (
                        <span className="font-jost" style={{ fontSize: 13, color: '#9AAA9A' }}>No change</span>
                      ) : (
                        <>
                          {d.improved ? <TrendingUp className="w-3.5 h-3.5" style={{ color: '#3D5A3E' }} />
                            : <TrendingDown className="w-3.5 h-3.5" style={{ color: '#C0392B' }} />}
                          <span className="font-jost" style={{ fontSize: 13, color: d.improved ? '#3D5A3E' : '#C0392B' }}>
                            {d.from} → {d.to}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        )}

        {history.length > 0 && (
          <AnimatedSection delay={0.2} className="mt-6">
            <div style={cardStyle}>
              <h2 className="font-cormorant font-semibold mb-4" style={{ fontSize: 20, color: '#1A1F1A' }}>History</h2>
              <div className="space-y-2">
                {history.slice(0, 8).map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #F0F0ED' }}>
                    <span className="font-jost" style={{ fontSize: 12, color: '#5C6B5C' }}>{h.created_at}</span>
                    <span className="font-jost font-semibold" style={{ fontSize: 13, color: '#1A1F1A' }}>Score {h.overall_score}</span>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>
        )}
      </div>
    </PageTransition>
  );
}
