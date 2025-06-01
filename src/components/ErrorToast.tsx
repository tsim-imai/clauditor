import { useEffect } from 'react';
import { X, AlertCircle, FileX, Shield, Network } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { getErrorMessage, ErrorType } from '../types/errors';

const getErrorIcon = (errorType: ErrorType) => {
  switch (errorType) {
    case ErrorType.FILE_NOT_FOUND:
      return <FileX size={20} />;
    case ErrorType.PERMISSION_DENIED:
      return <Shield size={20} />;
    case ErrorType.NETWORK_ERROR:
      return <Network size={20} />;
    default:
      return <AlertCircle size={20} />;
  }
};

const getErrorColor = (errorType: ErrorType) => {
  switch (errorType) {
    case ErrorType.FILE_NOT_FOUND:
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    case ErrorType.PERMISSION_DENIED:
      return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    case ErrorType.NETWORK_ERROR:
      return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    default:
      return 'border-red-500 bg-red-50 dark:bg-red-900/20';
  }
};

export const ErrorToast = () => {
  const { error, clearError } = useAppStore();

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 8000); // Auto-dismiss after 8 seconds

      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  if (!error) return null;

  const message = getErrorMessage(error);
  const icon = getErrorIcon(error.type);
  const colorClasses = getErrorColor(error.type);

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full">
      <div className={`border-l-4 p-4 rounded-lg shadow-lg ${colorClasses}`}>
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 text-gray-600 dark:text-gray-400">
            {icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              エラーが発生しました
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {message}
            </p>
            
            {error.details && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                詳細: {error.details}
              </p>
            )}
            
            {process.env.NODE_ENV === 'development' && error.context && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer">
                  開発者情報
                </summary>
                <pre className="text-xs text-gray-400 mt-1 overflow-auto">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              </details>
            )}
          </div>
          
          <button
            onClick={clearError}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};