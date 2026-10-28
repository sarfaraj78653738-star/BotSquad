import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="team" options={{ title: 'Team' }} />
      <Tabs.Screen name="group" options={{ title: 'Group' }} />
      <Tabs.Screen name="connect" options={{ title: 'Connect' }} />
      <Tabs.Screen name="routines" options={{ title: 'Routines' }} />
      <Tabs.Screen name="browser" options={{ title: 'Browser' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
