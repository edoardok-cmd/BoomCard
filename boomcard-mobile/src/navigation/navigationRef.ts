/**
 * Global navigation ref.
 *
 * Lets components that are mounted OUTSIDE the navigator's screen tree (e.g.
 * AccountStatusBanner, which renders as a sibling of the Stack.Navigator so it
 * can sit above every screen) trigger navigation without a navigation context.
 *
 * `useNavigation()` only resolves for components rendered inside a navigator's
 * screen tree; a sibling-of-navigator component has no navigator context and
 * `useNavigation()` would throw. Using the container ref is the supported
 * React Navigation v7 pattern for navigating from such components.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name: string, params?: Record<string, any>): void {
  if (navigationRef.isReady()) {
    // Cast: route names/params are validated at the call sites.
    (navigationRef.navigate as any)(name, params);
  }
}
