// ASR 处理面板组件

import { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useShowSuccess, useShowError, useShowInfo, useShowWarning } from '@/stores/messageStore';
import { asrService } from '@/services/asrService';
import type { ASRProgress } from '@/types/subtitle';
import { readFileAsArrayBuffer } from '@/utils/fileUtils';
import { 
  Mic, 
  Play, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Settings,
  Cpu,
  RefreshCw,
  Globe
} from 'lucide-react';
import { ASRLanguageSelector } from '@/components/ASR';

interface ASRPanelProps {
  className?: string;
}

export function ASRPanel({ className }: ASRPanelProps) {
  const videoFile = useAppStore((state) => state.videoFile);
  const language = useAppStore(state => state.language);
  const deviceType = useAppStore(state => state.deviceType);
  const asrProgress = useAppStore(state => state.asrProgress);
  const isLoading = useAppStore(state => state.isLoading);
  const error = useAppStore(state => state.error);
  
  const setASRProgress = useAppStore(state => state.setASRProgress);
  const setError = useAppStore(state => state.setError);
  const setLoading = useAppStore(state => state.setLoading);
  const setLanguage = useAppStore(state => state.setLanguage);
  const setDeviceType = useAppStore(state => state.setDeviceType);
  const setStage = useAppStore(state => state.setStage);
  
  // 使用 historyStore 管理转录内容
  const setTranscript = useHistoryStore(state => state.setTranscript);
  // const transcript = useTranscript(); // 使用预定义的选择器，避免无限重渲染
  const hasTranscriptChunks = useHistoryStore((state) => state.chunks.length > 0);
  
  // 消息中心操作
  const showSuccess = useShowSuccess();
  const showError = useShowError();
  const showInfo = useShowInfo();
  const showWarning = useShowWarning();

  const [showSettings, setShowSettings] = useState(false);
  const audioBufferRef = useRef<ArrayBuffer | null>(null);

  // 設定進度回調
  useEffect(() => {
    const handleProgress = (progress: ASRProgress) => {
      setASRProgress(progress);

      // 處理完成狀態
      if (progress.status === 'complete' && progress.result) {
        setTranscript(progress.result);
        setStage('edit'); // 自動切換到編輯階段
        const chunkCount = progress.result.chunks?.length || 0;
        const duration = progress.time ? (progress.time / 1000).toFixed(1) : '0';
        showSuccess(
          '語音辨識完成', 
          `成功辨識 ${chunkCount} 個句子片段，耗時 ${duration} 秒`
        );
      }

      // 處理錯誤狀態
      if (progress.status === 'error') {
        console.error('ASR處理進度錯誤:', progress.error);
        setError(`ASR處理失敗: ${progress.error}`);
        showError('語音辨識失敗', progress.error || '未知錯誤');
      }
      
      // 處理載入狀態
      if (progress.status === 'loading') {
        showInfo('正在載入模型', progress.data || '首次使用需要下載模型檔案...');
      }
      
      // 處理運行狀態
      if (progress.status === 'running') {
        showInfo('正在處理音訊', '正在辨識語音內容，請稍候...');
      }
      
      // 處理模型準備完成
      if (progress.status === 'loaded') {
        showSuccess('模型載入成功', '語音辨識模型已準備就緒，可以開始轉錄');
      }
    };

    asrService.setProgressCallback(handleProgress);

    return () => {
      asrService.setProgressCallback(() => {});
    };
  }, [setASRProgress, setTranscript, setError, setStage, showSuccess, showError, showInfo, showWarning]);

  // 設定裝置類型
  useEffect(() => {
    asrService.setDevice(deviceType);
  }, [deviceType]);

  // 檢查是否準備就緒
  const isReady = useCallback(() => {
    return asrService.isReady();
  }, []);

  // 加载模型
  const loadModel = useCallback(async () => {
    try {
      setLoading(true);
      await asrService.loadModel();
      showSuccess('模型載入成功', '語音辨識模型已準備就緒');
    } catch (error) {
      console.error('ASR模型載入失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '模型載入失敗';
      setError(errorMessage);
      showError('模型加载失败', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, showSuccess, showError]);

  // 開始轉錄
  const startTranscription = useCallback(async (audioBuffer: ArrayBuffer) => {
    if (!videoFile) {
      const errorMsg = '請先上傳影片檔案';
      setError(errorMsg);
      showWarning('無法開始轉錄', errorMsg);
      return;
    }

    try {
      setLoading(true);
      showInfo('開始語音辨識', '正在準備音訊資料...');
      
      // 先確保模型已準備
      if (!asrService.isReady()) {
        setASRProgress({ status: 'loading', data: '準備模型中...' });
        showInfo('準備模型', '首次使用需要下載和載入模型...');
        await asrService.prepareModel();
      }

      // 然後進行轉錄
      setASRProgress({ status: 'loading', data: '開始轉錄音訊...' });
      showInfo('開始轉錄', `正在辨識${language === 'zh' ? '中文' : '英文'}語音內容...`);
      
      await asrService.transcribeAudio(
        audioBuffer,
        language
      );

      // 注意：不在這裡設定 transcript，讓 progress callback 統一處理
    } catch (error) {
      console.error('ASR轉錄失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '轉錄失敗';
      setError(errorMessage);
      showError('轉錄過程失敗', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [videoFile, language, setLoading, setError, setASRProgress, showInfo, showWarning, showError]);

  // 重新開始轉錄
  const retryTranscription = useCallback(async (audioBuffer: ArrayBuffer) => {
    // 重置狀態
    setASRProgress({ status: 'loading', data: '準備重新轉錄...' });
    showInfo('重新開始轉錄', '正在重新處理音訊資料...');
    await startTranscription(audioBuffer);
  }, [startTranscription, setASRProgress, showInfo]);

  // 更改设备类型
  const changeDevice = useCallback((device: 'webgpu' | 'wasm') => {
    setDeviceType(device);
    const deviceName = device === 'webgpu' ? 'WebGPU (GPU加速)' : 'WebAssembly (CPU)';
    showInfo('设备切换成功', `已切换到 ${deviceName}`);
  }, [setDeviceType, showInfo]);

  // 更改语言
  const changeLanguage = useCallback((newLanguage: string) => {
    setLanguage(newLanguage);
    const languageName = newLanguage === 'zh' ? '中文' : newLanguage === 'en' ? '英文' : newLanguage;
    showInfo('語言切換成功', `辨識語言已設定為 ${languageName}`);
  }, [setLanguage, showInfo]);

  // 準備音訊資料
  const prepareAudioData = useCallback(async () => {
    if (!videoFile) {
      showWarning('缺少影片檔案', '請先選擇要處理的影片檔案');
      return null;
    }

    try {
      showInfo('準備音訊資料', '正在從影片檔案中提取音訊...');
      audioBufferRef.current = await readFileAsArrayBuffer(videoFile.file);
      return audioBufferRef.current;
    } catch (error) {
      console.error('音訊資料準備失敗:', error);
      console.error('音訊資料準備錯誤詳情:', { videoFile: videoFile?.name, error });
      const errorMessage = '音訊資料提取失敗，請檢查檔案格式';
      showError('音訊處理失敗', errorMessage);
      return null;
    }
  }, [videoFile, showInfo, showWarning, showError]);

  // 開始ASR處理
  const handleStartASR = useCallback(async () => {
    const audioBuffer = await prepareAudioData();
    if (!audioBuffer) {
      showError('無法開始處理', '音訊資料準備失敗，請重試');
      return;
    }

    if (!isReady()) {
      showInfo('準備模型', '正在載入語音辨識模型...');
      await loadModel();
    }

    await startTranscription(audioBuffer);
  }, [prepareAudioData, isReady, loadModel, startTranscription, showError, showInfo]);

  // 重试ASR处理
  const handleRetryASR = useCallback(async () => {
    if (audioBufferRef.current) {
      await retryTranscription(audioBufferRef.current);
    } else {
      await handleStartASR();
    }
  }, [audioBufferRef, retryTranscription, handleStartASR]);

  // 语言变更
  const handleLanguageChange = useCallback((newLanguage: string) => {
    changeLanguage(newLanguage);
  }, [changeLanguage]);

  // 设备类型变更
  const handleDeviceChange = useCallback((newDevice: 'webgpu' | 'wasm') => {
    changeDevice(newDevice);
  }, [changeDevice]);

  // 获取简化状态显示
  const getSimpleStatus = () => {
    if (error) {
      return { icon: <AlertCircle className="h-4 w-4 text-red-500" />, text: '處理失敗', color: 'text-red-600' };
    }
    if (asrProgress?.status === 'complete') {
      return { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, text: '已完成', color: 'text-green-600' };
    }
    if (isLoading || asrProgress?.status === 'loading' || asrProgress?.status === 'running') {
      return { icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />, text: '處理中', color: 'text-blue-600' };
    }
    if (isReady()) {
      return { icon: <Mic className="h-4 w-4 text-green-500" />, text: '已就緒', color: 'text-green-600' };
    }
    return { icon: <Play className="h-4 w-4 text-muted-foreground" />, text: '待開始', color: 'text-muted-foreground' };
  };

  const statusDisplay = getSimpleStatus();
  const canStart = videoFile && !isLoading && !asrProgress?.status;
  const canRetry = error || (asrProgress?.status === 'complete' && hasTranscriptChunks);

  return (
    <div className={cn('bg-card border rounded-lg p-6 space-y-4', className)}>
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center space-x-2">
          <Mic className="h-5 w-5" />
          <span>語音辨識 (ASR)</span>
        </h3>
        
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title="設定"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* 設定面板 */}
      {showSettings && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ASR語言選擇 */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-medium">
                <Globe className="h-4 w-4" />
                <span>辨識語言</span>
              </label>
              <ASRLanguageSelector
                language={language}
                onLanguageChange={handleLanguageChange}
                disabled={isLoading}
                placeholder="搜尋支援的語音辨識語言..."
              />
            </div>

            {/* 设备类型选择 */}
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm font-medium">
                <Cpu className="h-4 w-4" />
                <span>計算裝置</span>
              </label>
              <select
                value={deviceType}
                onChange={(e) => handleDeviceChange(e.target.value as 'webgpu' | 'wasm')}
                className="w-full p-2 border rounded-md bg-background"
                disabled={isLoading}
              >
                <option value="webgpu">WebGPU (推薦)</option>
                <option value="wasm">WebAssembly (相容)</option>
              </select>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>WebGPU</strong>: 速度更快，需要現代瀏覽器支援</p>
            <p>• <strong>WebAssembly</strong>: 相容性更好，適用於所有瀏覽器</p>
            <p>• 首次使用會下載約 {deviceType === 'webgpu' ? '196MB' : '77MB'} 的模型檔案</p>
          </div>
        </div>
      )}

      {/* 状态显示 */}
      <div className="flex items-center space-x-3 p-4 border rounded-lg">
        {statusDisplay.icon}
        <div className="flex-1">
          <p className={cn('font-medium', statusDisplay.color)}>
            {statusDisplay.text}
          </p>
        </div>
      </div>

      {/* 进度显示 */}
      {asrProgress && asrProgress.progress !== undefined && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>載入進度</span>
            <span>{Math.round(asrProgress.progress || 0)}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${asrProgress.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* 快速ASR语言选择 */}
      {!showSettings && (
        <div className="border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center space-x-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">辨識語言</span>
          </div>
          <ASRLanguageSelector
            language={language}
            onLanguageChange={handleLanguageChange}
            disabled={isLoading}
            className="max-w-xs"
          />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex space-x-3">
        <button
          onClick={handleStartASR}
          disabled={!canStart}
          className={cn(
            'flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md transition-colors',
            'font-medium text-sm',
            canStart
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Play className="h-4 w-4" />
          <span>開始產生字幕</span>
        </button>

        {canRetry && (
          <button
            onClick={handleRetryASR}
            className="flex items-center space-x-2 py-2.5 px-4 border rounded-md hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>重試</span>
          </button>
        )}
      </div>

      {/* 文件信息 */}
      {videoFile && (
        <div className="text-xs text-muted-foreground border-t pt-4">
          <p>檔案: {videoFile.name}</p>
          <p>類型: {videoFile.type}</p>
          {videoFile.duration > 0 && (
            <p>時長: {Math.floor(videoFile.duration / 60)}:{Math.floor(videoFile.duration % 60).toString().padStart(2, '0')}</p>
          )}
        </div>
      )}
    </div>
  );
}