/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {AppShell} from './components/AppShell';
import {LoginScreen} from './components/LoginScreen';
import {OfflineIndicator} from './components/OfflineIndicator';
import {SetupGuide} from './components/SetupGuide';
import {UnauthorizedScreen} from './components/UnauthorizedScreen';
import {AuthProvider, useAuth} from './context/AuthContext';

const RootRouter: React.FC = () => {
  const {status} = useAuth();

  if (status === 'unconfigured') {
    return <SetupGuide />;
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/icon.svg" alt="Memuat" className="h-11 w-11 rounded-xl" />
          <p className="text-sm font-medium text-slate-600">
            Memverifikasi sesi dan hak akses...
          </p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginScreen />;
  }

  if (status === 'unauthorized') {
    return <UnauthorizedScreen />;
  }

  return <AppShell />;
};

export default function App() {
  return (
    <AuthProvider>
      <RootRouter />
      <OfflineIndicator />
    </AuthProvider>
  );
}
