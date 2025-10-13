import React from 'react';
import { motion } from 'framer-motion';

export interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

const sizeClasses = {
  small: 'h-6 w-6',
  medium: 'h-10 w-10',
  large: 'h-16 w-16',
};

export const Loading: React.FC<LoadingProps> = ({
  size = 'medium',
  fullScreen = false
}) => {
  const spinner = (
    <motion.div
      className={`${sizeClasses[size]} border-4 border-gray-200 border-t-black rounded-full`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="text-center">
          {spinner}
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center p-8">
      {spinner}
    </div>
  );
};

export default Loading;
