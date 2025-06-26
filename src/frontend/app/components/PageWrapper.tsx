import React from 'react';
import Navbar from './NavBar';
import Background from './Background';

interface PageWrapperProps {
  children: React.ReactNode
}

const PageWrapper = ({ children }: PageWrapperProps) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Background />
      </div>

      <div className="relative z-10 text-white pointer-events-none">
        <Navbar className="pointer-events-auto" />
        <main className="pointer-events-auto py-12 px-4">
          {children}
        </main>
      </div>
    </div>
  )
}
export default PageWrapper