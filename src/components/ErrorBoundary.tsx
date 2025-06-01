import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                予期しないエラーが発生しました
              </h1>
            </div>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              アプリケーションでエラーが発生しました。ページを再読み込みしてお試しください。
            </p>
            
            {this.state.error && (
              <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded mb-4">
                <p className="text-sm text-gray-800 dark:text-gray-200 font-mono">
                  {this.state.error.message}
                </p>
              </div>
            )}
            
            <div className="flex space-x-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                再試行
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <RefreshCw size={16} />
                <span>再読み込み</span>
              </button>
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
                  開発者情報
                </summary>
                <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-auto">
                  {this.state.error && this.state.error.stack}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}