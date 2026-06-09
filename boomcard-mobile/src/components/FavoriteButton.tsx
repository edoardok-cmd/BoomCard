/**
 * FavoriteButton (N5)
 *
 * A heart toggle that adds/removes a favorite for any entity kind
 * (partner | offer | venue). Optimistically flips, reverting on failure.
 */

import React, { useEffect, useState } from 'react';
import { TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { favoritesApi, FavoriteKind } from '../api/favorites.api';

interface Props {
  entityKind: FavoriteKind;
  entityId: string;
  size?: number;
  style?: ViewStyle;
  /** When the favorite set is already known, pass the initial state to skip the fetch. */
  initialFavorited?: boolean;
  onChange?: (favorited: boolean) => void;
}

const FavoriteButton: React.FC<Props> = ({ entityKind, entityId, size = 22, style, initialFavorited, onChange }) => {
  const [favorited, setFavorited] = useState<boolean>(!!initialFavorited);
  const [loading, setLoading] = useState<boolean>(initialFavorited === undefined);
  const [busy, setBusy] = useState(false);

  // Resolve current state from the list when not seeded by the parent.
  useEffect(() => {
    if (initialFavorited !== undefined) return;
    let active = true;
    favoritesApi.list().then((res) => {
      if (!active) return;
      if (res.success && Array.isArray(res.data)) {
        setFavorited(res.data.some((f) => f.entityKind === entityKind && f.entityId === entityId));
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityKind, entityId, initialFavorited]);

  const toggle = async () => {
    if (busy) return;
    const next = !favorited;
    setFavorited(next);
    setBusy(true);
    try {
      const res = next
        ? await favoritesApi.add(entityKind, entityId)
        : await favoritesApi.remove(entityKind, entityId);
      if (!res.success) throw new Error(res.error || 'failed');
      onChange?.(next);
    } catch {
      setFavorited(!next); // revert
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ActivityIndicator size="small" color="#EF4444" style={[styles.btn, style]} />;
  }

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={toggle}
      disabled={busy}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      accessibilityRole="button"
    >
      <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={size} color="#EF4444" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: { padding: 4 },
});

export default FavoriteButton;
