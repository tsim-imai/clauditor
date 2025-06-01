import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  className?: string;
}

export const LoadingSpinner = ({ 
  size = 'medium', 
  message, 
  className = '' 
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2 
        className={`${sizeClasses[size]} animate-spin text-blue-600 dark:text-blue-400`} 
      />
      {message && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {message}
        </p>
      )}
    </div>
  );
};