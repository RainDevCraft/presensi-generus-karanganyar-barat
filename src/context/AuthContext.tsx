import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {isSupabaseConfigured, supabase} from '../lib/supabase';
import type {Profile} from '../types/database';

export type AuthStatus =
  | 'unconfigured'
  | 'loading'
  | 'unauthenticated'
  | 'unauthorized'
  | 'authenticated';

interface SyncProfileRpcResult {
  authorized: boolean;
  reason?: 'unauthenticated' | 'not_whitelisted' | 'inactive';
  email?: string;
  profile?: Profile;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: Profile | null;
  desaName: string | null;
  kelompokName: string | null;
  unauthorizedReason: string | null;
  unauthorizedEmail: string | null;
  errorMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'unconfigured',
  );
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [desaName, setDesaName] = useState<string | null>(null);
  const [kelompokName, setKelompokName] = useState<string | null>(null);
  const [unauthorizedReason, setUnauthorizedReason] = useState<string | null>(null);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveScopeNames = useCallback(async (prof: Profile) => {
    if (!supabase) return;
    let nextDesaName: string | null = null;
    let nextKelompokName: string | null = null;

    if (prof.desa_id) {
      const {data: desaRow} = await supabase
        .from('desas')
        .select('name')
        .eq('id', prof.desa_id)
        .maybeSingle();
      nextDesaName = desaRow?.name ?? null;
    }

    if (prof.kelompok_id) {
      const {data: kelRow} = await supabase
        .from('kelompoks')
        .select('name')
        .eq('id', prof.kelompok_id)
        .maybeSingle();
      nextKelompokName = kelRow?.name ?? null;
    }

    setDesaName(nextDesaName);
    setKelompokName(nextKelompokName);
  }, []);

  const syncProfile = useCallback(
    async (sessionUser: User | null) => {
      if (!supabase) {
        setStatus('unconfigured');
        return;
      }

      if (!sessionUser) {
        setUser(null);
        setProfile(null);
        setDesaName(null);
        setKelompokName(null);
        setUnauthorizedReason(null);
        setUnauthorizedEmail(null);
        setStatus('unauthenticated');
        return;
      }

      setUser(sessionUser);
      setErrorMessage(null);

      try {
        const {data, error} = await supabase.rpc('sync_my_profile');
        if (error) {
          throw error;
        }

        const result = data as SyncProfileRpcResult | null;
        if (!result || !result.authorized || !result.profile) {
          setProfile(null);
          setDesaName(null);
          setKelompokName(null);
          setUnauthorizedReason(result?.reason ?? 'not_whitelisted');
          setUnauthorizedEmail(result?.email ?? sessionUser.email ?? null);
          setStatus('unauthorized');
          return;
        }

        setProfile(result.profile);
        await resolveScopeNames(result.profile);
        setUnauthorizedReason(null);
        setUnauthorizedEmail(null);
        setStatus('authenticated');
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Gagal memverifikasi akses akun.';
        setErrorMessage(message);
        setStatus('unauthenticated');
      }
    },
    [resolveScopeNames],
  );

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({data}) => {
      if (!mounted) return;
      void syncProfile(data.session?.user ?? null);
    });

    const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      void syncProfile(session?.user ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [syncProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setErrorMessage(null);
    const {error} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setErrorMessage(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setDesaName(null);
    setKelompokName(null);
    setUnauthorizedReason(null);
    setUnauthorizedEmail(null);
    setStatus('unauthenticated');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return;
    const {data} = await supabase.auth.getUser();
    await syncProfile(data.user ?? null);
  }, [syncProfile]);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        profile,
        desaName,
        kelompokName,
        unauthorizedReason,
        unauthorizedEmail,
        errorMessage,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
