import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FiDroplet, FiX, FiRefreshCw, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import axiosInstance from '../config/axios';

// ---------------------------------------------------------------------------
// Water tank: an interactive, continuously-animated liquid surface.
// - Idle: two layered sine waves drift on their own (rAF loop).
// - Pointer move: the surface tilts / crests toward the cursor, like real
//   liquid sloshing when you nudge a glass.
// - Click / tap: spawns a ripple at the contact point.
// Pure SVG + JS, no extra deps.
// ---------------------------------------------------------------------------

const TANK_W = 240;
const TANK_H = 190;
const TANK_PAD = 6;

const STATE_COLORS = {
  good: { front: '#3b82f6', back: '#60a5fa', text: 'text-blue-700', dot: 'bg-blue-500', chipBg: 'bg-blue-50', chipBorder: 'border-blue-200' },
  moderate: { front: '#eab308', back: '#facc15', text: 'text-yellow-700', dot: 'bg-yellow-500', chipBg: 'bg-yellow-50', chipBorder: 'border-yellow-200' },
  critical: { front: '#ef4444', back: '#f87171', text: 'text-red-700', dot: 'bg-red-500', chipBg: 'bg-red-50', chipBorder: 'border-red-200' },
};

const getFillState = (percentage) => {
  if (percentage > 60) return 'good';
  if (percentage > 30) return 'moderate';
  return 'critical';
};

const buildWavePath = (width, height, waterY, amplitude, wavelength, phase) => {
  const step = 12;
  let d = `M0,${height.toFixed(1)}`;
  for (let x = 0; x <= width; x += step) {
    const y = waterY + amplitude * Math.sin(x / wavelength + phase);
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  d += ` L${width},${height.toFixed(1)} Z`;
  return d;
};

const WaterTank = ({ percentage, fillState, isRefilling, refillProgress }) => {
  const svgRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const phaseRef = useRef(0);
  const tiltTargetRef = useRef({ x: 0, y: 0 });
  const tiltCurrentRef = useRef({ x: 0, y: 0 });

  const [, forceTick] = useState(0);
  const [ripples, setRipples] = useState([]);

  const effectivePct = isRefilling
    ? Math.min(100, percentage + (refillProgress / 100) * (100 - percentage))
    : percentage;

  useEffect(() => {
    const animate = (ts) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = Math.min(48, ts - lastTsRef.current);
      lastTsRef.current = ts;

      phaseRef.current += dt * 0.0022;

      const t = tiltCurrentRef.current;
      const target = tiltTargetRef.current;
      t.x += (target.x - t.x) * 0.06;
      t.y += (target.y - t.y) * 0.06;

      forceTick((n) => (n + 1) % 1000000);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const toLocalPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    return { x: relX * TANK_W, y: relY * TANK_H, relX, relY };
  }, []);

  const handlePointerMove = useCallback((e) => {
    const { relX, relY } = toLocalPoint(e.clientX, e.clientY);
    tiltTargetRef.current = {
      x: (relX - 0.5) * 2,
      y: (relY - 0.5) * 2,
    };
  }, [toLocalPoint]);

  const handlePointerLeave = useCallback(() => {
    tiltTargetRef.current = { x: 0, y: 0 };
  }, []);

  const spawnRipple = useCallback((clientX, clientY) => {
    const { x, y } = toLocalPoint(clientX, clientY);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 900);
  }, [toLocalPoint]);

  const handlePointerDown = useCallback((e) => {
    spawnRipple(e.clientX, e.clientY);
    tiltTargetRef.current = {
      x: tiltTargetRef.current.x * 1.6,
      y: tiltTargetRef.current.y * 1.6,
    };
  }, [spawnRipple]);

  const colors = STATE_COLORS[fillState];

  const usable = TANK_H - TANK_PAD * 2;
  const waterY = TANK_PAD + usable * (1 - effectivePct / 100);

  const tilt = tiltCurrentRef.current;
  const tiltPhaseShift = tilt.x * 0.9;
  const tiltYShift = tilt.y * 6;

  const backPath = buildWavePath(TANK_W, TANK_H, waterY + tiltYShift - 2, 5, 34, phaseRef.current * 0.8 + tiltPhaseShift);
  const frontPath = buildWavePath(TANK_W, TANK_H, waterY + tiltYShift, 6.5, 26, phaseRef.current + tiltPhaseShift * 1.3);

  const clipId = 'tank-clip';

  return (
    <div className="relative select-none" style={{ touchAction: 'none' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${TANK_W} ${TANK_H}`}
        width="100%"
        height="180"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        className="cursor-pointer"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="2" y="2" width={TANK_W - 4} height={TANK_H - 4} rx="16" ry="16" />
          </clipPath>
        </defs>

        <rect
          x="2" y="2" width={TANK_W - 4} height={TANK_H - 4} rx="16" ry="16"
          fill="rgba(148,163,184,0.06)"
          stroke="rgba(148,163,184,0.35)"
          strokeWidth="1.5"
        />

        <g clipPath={`url(#${clipId})`}>
          <path d={backPath} fill={colors.back} opacity="0.45" />
          <path d={frontPath} fill={colors.front} opacity="0.92" />

          <rect x="10" y="4" width="7" height={TANK_H - 8} fill="white" opacity="0.08" rx="3" />

          {ripples.map((r) => (
            <g key={r.id}>
              <circle cx={r.x} cy={r.y} r="2" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="1.6">
                <animate attributeName="r" from="2" to="26" dur="0.9s" fill="freeze" />
                <animate attributeName="stroke-opacity" from="0.85" to="0" dur="0.9s" fill="freeze" />
              </circle>
              <circle cx={r.x} cy={r.y} r="1.5" fill="white" fillOpacity="0.6">
                <animate attributeName="r" from="1.5" to="12" dur="0.6s" fill="freeze" />
                <animate attributeName="fill-opacity" from="0.6" to="0" dur="0.6s" fill="freeze" />
              </circle>
            </g>
          ))}
        </g>

        <rect
          x="2" y="2" width={TANK_W - 4} height={TANK_H - 4} rx="16" ry="16"
          fill="none"
          stroke="rgba(148,163,184,0.5)"
          strokeWidth="1.5"
        />

        <rect x={TANK_W - 26} y="-6" width="18" height="10" rx="3"
          fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5" />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-2xl font-bold drop-shadow-sm ${colors.text}`} style={{ textShadow: '0 1px 2px rgba(255,255,255,0.6)' }}>
          {Math.round(effectivePct)}%
        </span>
      </div>

      <p className="text-center text-[10px] text-gray-400 mt-1.5">
        Move your cursor over the tank, or tap it, to see it ripple
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ultra Compact Indicator
// ---------------------------------------------------------------------------
const SanitizationIndicator = ({ totalTaps, machineId, containerSize = 5, usagePerTap = 0.012 }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refillData, setRefillData] = useState(null);
  const [loading, setLoading] = useState(true);

  const calculateCurrentPercentage = () => {
    if (!refillData || !refillData.hasRefill) {
      const usedLiquid = totalTaps * usagePerTap;
      const remaining = Math.max(0, containerSize - usedLiquid);
      return Math.min(100, (remaining / containerSize) * 100);
    }

    const startTapCount = refillData.startTapCount || 0;
    const tapsSinceRefill = Math.max(0, totalTaps - startTapCount);
    const usedLiquid = tapsSinceRefill * usagePerTap;
    const remaining = Math.max(0, containerSize - usedLiquid);
    return Math.min(100, (remaining / containerSize) * 100);
  };

  const percentage = calculateCurrentPercentage();
  const fillState = getFillState(percentage);
  const colors = STATE_COLORS[fillState];

  useEffect(() => {
    const fetchRefillData = async () => {
      if (!machineId) {
        setLoading(false);
        return;
      }

      try {
        const response = await axiosInstance.get(`/api/refill/${machineId}/start-tapcount`);
        const data = response.data;

        if (data.success && data.data && data.data.hasRefill) {
          setRefillData(data.data);
        } else {
          setRefillData({ hasRefill: false, startTapCount: 0 });
        }
      } catch (error) {
        console.error('Error fetching refill data:', error);
        setRefillData({ hasRefill: false, startTapCount: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchRefillData();
  }, [machineId]);

  const hasRefill = refillData?.hasRefill || false;

  if (loading) {
    return (
      <button className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 cursor-default">
        <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400">Loading</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${colors.chipBorder} ${colors.chipBg} hover:brightness-95 transition-all group`}
        title="Click for sanitization details"
      >
        <span className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse`} />
        <span className={`text-xs font-bold ${colors.text}`}>
          {Math.round(percentage)}%
        </span>
        <FiDroplet className={`text-[10px] ${colors.text} group-hover:opacity-100 opacity-50 transition-opacity`} />
        {hasRefill && (
          <span className="text-[8px] text-green-500 ml-0.5">✓</span>
        )}
      </button>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${colors.chipBg}`}>
                  <FiDroplet className={`text-base ${colors.text}`} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Sanitization</h3>
                  <p className="text-[10px] text-gray-500 font-mono">#{machineId}</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <FiX className="text-lg text-gray-500" />
              </button>
            </div>

            <div className="p-4">
              <SanitizationLevel
                machineId={machineId}
                totalTaps={totalTaps}
                containerSize={containerSize}
                usagePerTap={usagePerTap}
                externalRefillData={refillData}
                onRefillComplete={() => {
                  window.location.reload();
                }}
              />
            </div>

            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 rounded-b-2xl flex justify-between items-center">
              <span className="text-[10px] text-gray-400">
                {new Date().toLocaleString()}
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// SanitizationLevel Component
// ---------------------------------------------------------------------------
const SanitizationLevel = ({
  machineId,
  totalTaps,
  containerSize = 5,
  usagePerTap = 0.012,
  externalRefillData = null,
  onRefillComplete
}) => {
  const [liquidLevel, setLiquidLevel] = useState(containerSize);
  const [isRefilling, setIsRefilling] = useState(false);
  const [refillProgress, setRefillProgress] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [startTapCount, setStartTapCount] = useState(0);
  const [refillStartTime, setRefillStartTime] = useState(null);
  const [hasRefill, setHasRefill] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refillSuccess, setRefillSuccess] = useState(false);
  const [error, setError] = useState(null);

  const [refillQuantity, setRefillQuantity] = useState(containerSize);

  useEffect(() => {
    if (externalRefillData) {
      setStartTapCount(externalRefillData.startTapCount || 0);
      setRefillStartTime(externalRefillData.refillStartTime || null);
      setHasRefill(externalRefillData.hasRefill || false);
      setIsLoading(false);
      if (externalRefillData.containerSize) {
        setRefillQuantity(externalRefillData.containerSize);
      }
    } else {
      fetchRefillData();
    }
  }, [machineId, externalRefillData]);

  const fetchRefillData = async () => {
    if (!machineId) return;

    try {
      const response = await axiosInstance.get(`/api/refill/${machineId}/start-tapcount`);
      const data = response.data;

      if (data.success && data.data && data.data.hasRefill) {
        setStartTapCount(data.data.startTapCount);
        setRefillStartTime(data.data.refillStartTime);
        setHasRefill(true);
        if (data.data.containerSize) {
          setRefillQuantity(data.data.containerSize);
        }
      } else {
        setStartTapCount(0);
        setRefillStartTime(null);
        setHasRefill(false);
      }
    } catch (error) {
      console.error('Error fetching refill data:', error);
      setStartTapCount(0);
      setRefillStartTime(null);
      setHasRefill(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && totalTaps !== undefined) {
      if (hasRefill) {
        const tapsSinceRefill = Math.max(0, totalTaps - startTapCount);
        const usedLiquid = tapsSinceRefill * usagePerTap;
        const remaining = Math.max(0, refillQuantity - usedLiquid);
        setLiquidLevel(remaining);
        setShowWarning(remaining < refillQuantity * 0.2);
      } else {
        const usedLiquid = totalTaps * usagePerTap;
        const remaining = Math.max(0, refillQuantity - usedLiquid);
        setLiquidLevel(remaining);
        setShowWarning(remaining < refillQuantity * 0.2);
      }
    }
  }, [totalTaps, usagePerTap, isLoading, refillQuantity, hasRefill, startTapCount]);

  const percentage = useMemo(() => {
    return Math.min(100, (liquidLevel / refillQuantity) * 100);
  }, [liquidLevel, refillQuantity]);

  const fillState = getFillState(percentage);
  const colors = STATE_COLORS[fillState];

  const tapsSinceRefill = useMemo(() => {
    if (hasRefill) {
      return Math.max(0, totalTaps - startTapCount);
    }
    return totalTaps;
  }, [totalTaps, startTapCount, hasRefill]);

  const estimatedTapsRemaining = useMemo(() => {
    if (usagePerTap === 0) return 0;
    return Math.floor(liquidLevel / usagePerTap);
  }, [liquidLevel, usagePerTap]);

  const usedLiters = useMemo(() => {
    return refillQuantity - liquidLevel;
  }, [refillQuantity, liquidLevel]);

  const handleRefill = async () => {
    if (isRefilling) return;

    setError(null);
    setIsRefilling(true);
    setRefillProgress(0);
    setRefillSuccess(false);

    try {
      const currentTapCount = totalTaps || 0;

      const response = await axiosInstance.post(`/api/refill/${machineId}`, {
        tapCount: currentTapCount,
        containerSize: refillQuantity,
        usagePerTap: usagePerTap
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Failed to start refill');
      }

      setStartTapCount(currentTapCount);
      setRefillStartTime(new Date().toISOString());
      setHasRefill(true);
      setRefillSuccess(true);
      setLiquidLevel(refillQuantity);

      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setRefillProgress(progress);
        if (progress >= 100) {
          clearInterval(interval);
          setIsRefilling(false);
          if (onRefillComplete) {
            setTimeout(onRefillComplete, 1500);
          }
        }
      }, 50);

    } catch (error) {
      console.error('Refill error:', error);
      setError(error.response?.data?.message || error.message || 'Failed to start refill');
      setIsRefilling(false);
    }
  };

  const formatLiters = (liters) => {
    if (liters < 0.001) return '0 mL';
    if (liters < 1) return `${Math.round(liters * 1000)} mL`;
    return `${liters.toFixed(2)} L`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {refillSuccess && (
        <div className="p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <FiCheckCircle className="text-green-500 text-sm" />
          <p className="text-[10px] text-green-700 font-medium">Refill complete. Tank is 100% full.</p>
        </div>
      )}

      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse`} />
          <span className="text-xs font-medium text-gray-700">
            {fillState === 'good' ? 'Good' : fillState === 'moderate' ? 'Moderate' : 'Critical'}
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900">
          {Math.round(percentage)}%
        </span>
      </div>

      <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FiDroplet className="text-blue-500 text-sm" />
            <span className="text-xs font-medium text-gray-700">Container</span>
          </div>
          <span className="text-xs font-bold text-gray-800">{refillQuantity}L</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {usagePerTap * 1000}ml/tap • {Math.round(refillQuantity / usagePerTap).toLocaleString()} taps/tank
        </p>
      </div>

      <div className="p-2 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700">
          Total taps: <span className="font-bold">{totalTaps.toLocaleString()}</span>
        </p>
        {hasRefill && (
          <>
            <p className="text-xs text-blue-700">
              Taps since refill: <span className="font-bold">{tapsSinceRefill.toLocaleString()}</span>
            </p>
            <p className="text-xs text-blue-700">
              Refilled at: <span className="font-bold">{startTapCount.toLocaleString()}</span> taps
            </p>
          </>
        )}
        <p className="text-xs text-blue-700">
          Used: <span className="font-bold">{formatLiters(usedLiters)}</span>
        </p>
      </div>

      <WaterTank
        percentage={percentage}
        fillState={fillState}
        isRefilling={isRefilling}
        refillProgress={refillProgress}
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-[8px] text-gray-400 font-bold uppercase">Remaining</p>
          <p className={`text-xs font-bold ${colors.text}`}>
            {formatLiters(liquidLevel)}
          </p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-[8px] text-gray-400 font-bold uppercase">Used</p>
          <p className="text-xs font-bold text-gray-700">{formatLiters(usedLiters)}</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-[8px] text-gray-400 font-bold uppercase">Taps Left</p>
          <p className="text-xs font-bold text-gray-700">{estimatedTapsRemaining.toLocaleString()}</p>
        </div>
      </div>

      {showWarning && !isRefilling && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-1.5 animate-pulse">
          <FiAlertTriangle className="text-red-500 text-sm" />
          <p className="text-[10px] text-red-700 font-medium">
            Only {formatLiters(liquidLevel)} left ({estimatedTapsRemaining} taps)
          </p>
        </div>
      )}

      <button
        onClick={handleRefill}
        disabled={isRefilling}
        className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
          isRefilling
            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:shadow-lg transform hover:scale-[1.01]'
        }`}
      >
        {isRefilling ? (
          <>
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
            Refilling... {Math.round(refillProgress)}%
          </>
        ) : (
          <>
            <FiRefreshCw className="text-sm" />
            {hasRefill ? 'Refill' : 'Start Refill'} ({refillQuantity}L)
          </>
        )}
      </button>

      {isRefilling && (
        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${refillProgress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export { SanitizationIndicator, SanitizationLevel };