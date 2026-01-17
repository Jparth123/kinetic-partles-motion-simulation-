import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Effects } from '@react-three/drei';
import { UnrealBloomPass } from 'three-stdlib';
import { ParticleScene } from './components/ParticleScene';
import { LiveApiService, blobToBase64 } from './services/liveApiService';
import { ParticleState, LiveConnectionState } from './types';
import { Video, Sparkles, AlertCircle, Hand, Mic, Maximize2, Palette, Activity } from 'lucide-react';
import { extend } from '@react-three/fiber';

extend({ UnrealBloomPass });

const INITIAL_STATE: ParticleState = {
  shape: 'sphere',
  expansion: 1.0,
  colorPalette: 'neon',
  speed: 0.5,
  rotationSpeed: 0.2,
};

const App: React.FC = () => {
  const [particleState, setParticleState] = useState<ParticleState>(INITIAL_STATE);
  const [connection, setConnection] = useState<LiveConnectionState>({
    isConnected: false,
    isStreaming: false,
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveApiRef = useRef<LiveApiService | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const handleStateUpdate = useCallback((update: Partial<ParticleState>) => {
    setParticleState(prev => ({ ...prev, ...update }));
  }, []);

  const handleError = useCallback((error: string) => {
    setConnection(prev => ({ ...prev, error, isConnected: false, isStreaming: false }));
  }, []);

  useEffect(() => {
    liveApiRef.current = new LiveApiService(handleStateUpdate, handleError);
    return () => {
      stopStream();
      liveApiRef.current?.disconnect();
    };
  }, [handleStateUpdate, handleError]);

  const startStream = async () => {
    try {
      setConnection({ isConnected: false, isStreaming: true, error: null });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 }, // Low res for AI speed
        audio: true // Audio is required for connection, though we might not use it
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await liveApiRef.current?.connect();
      setConnection(prev => ({ ...prev, isConnected: true }));

      // Start Frame Loop
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && videoRef.current) {
        frameIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || !liveApiRef.current) return;
          
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          canvasRef.current?.toBlob(async (blob) => {
            if (blob) {
              const base64 = await blobToBase64(blob);
              await liveApiRef.current?.sendVideoFrame(base64);
            }
          }, 'image/jpeg', 0.6);
        }, 500); // 2 FPS to GenAI is usually sufficient for gestures without killing rate limits
      }

    } catch (err: any) {
      handleError(err.message || 'Failed to access camera');
    }
  };

  const stopStream = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    liveApiRef.current?.disconnect();
    setConnection({ isConnected: false, isStreaming: false, error: null });
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 8], fov: 60 }} gl={{ antialias: false }}>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <ParticleScene targetState={particleState} />
          <OrbitControls enableZoom={false} autoRotate={false} />
          {/* Post Processing for Glow */}
          <Effects disableGamma>
             {/* @ts-ignore */}
             <unrealBloomPass threshold={0.1} strength={0.8} radius={0.5} />
          </Effects>
          <Environment preset="city" />
        </Canvas>
      </div>

      {/* Foreground UI */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
              Gemini Kinetic
            </h1>
            <p className="text-gray-400 text-sm mt-1">AI-Powered Gesture Particles</p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            {!connection.isStreaming ? (
              <button 
                onClick={startStream}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all shadow-lg shadow-blue-900/50"
              >
                <Video size={18} /> Start Camera
              </button>
            ) : (
               <button 
                onClick={stopStream}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-full transition-all"
              >
                <Video size={18} /> Stop
              </button>
            )}

            {connection.error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-900/20 px-3 py-1 rounded text-sm">
                <AlertCircle size={14} /> {connection.error}
              </div>
            )}
            
            {connection.isConnected && (
              <div className="flex items-center gap-2 text-green-400 bg-green-900/20 px-3 py-1 rounded text-sm animate-pulse">
                <Activity size={14} /> Live Connected
              </div>
            )}
          </div>
        </div>

        {/* HUD Stats */}
        <div className="flex justify-between items-end pointer-events-auto">
           {/* Current State Display */}
           <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl text-sm text-gray-300 space-y-2 w-64">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Sparkles size={14}/> Shape</span>
                <span className="text-white font-mono uppercase">{particleState.shape}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Maximize2 size={14}/> Expansion</span>
                <div className="w-24 h-1 bg-gray-700 rounded-full overflow-hidden">
                   <div 
                      className="h-full bg-blue-500 transition-all duration-300" 
                      style={{ width: `${(particleState.expansion / 3) * 100}%` }}
                   />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Palette size={14}/> Color</span>
                <span className="text-white font-mono uppercase">{particleState.colorPalette}</span>
              </div>
           </div>

           {/* Video Preview (Hidden but required for processing) */}
           <div className="relative group">
              <video 
                ref={videoRef} 
                className={`w-48 h-36 object-cover rounded-lg border-2 ${connection.isConnected ? 'border-green-500/50' : 'border-gray-700'} bg-black`}
                muted 
                playsInline 
              />
              <div className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-0.5 rounded">Input Feed</div>
              
              {/* Instructions Tooltip */}
              <div className="absolute bottom-full right-0 mb-4 w-64 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 text-xs text-gray-300 hidden group-hover:block transition-all">
                <h3 className="text-white font-bold mb-2">Gestures</h3>
                <ul className="space-y-1">
                  <li className="flex gap-2"><Hand size={12}/> Open Hand: Expand</li>
                  <li className="flex gap-2"><Hand size={12} className="rotate-90"/> Fist: Contract</li>
                  <li className="flex gap-2">✌️ Peace: Heart Shape</li>
                  <li className="flex gap-2">☝️ Point: Change Color</li>
                  <li className="flex gap-2">👍 Thumbs Up: Fireworks</li>
                  <li className="flex gap-2">👋 Wave: Helix / Spin</li>
                </ul>
              </div>
           </div>
        </div>
      </div>

      {/* Hidden Canvas for frame extraction */}
      <canvas ref={canvasRef} width="320" height="240" className="hidden" />
    </div>
  );
};

export default App;
