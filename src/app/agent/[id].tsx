import React, { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { AdaptiveShell } from '../../components/AdaptiveShell';
import { AgentDetailView } from '../../components/AgentDetailView';
import { useControl } from '../../control/ControlProvider';
import { colors } from '../../theme/tokens';

export default function AgentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, setSelectedAgentId } = useControl();
  const agent = snapshot.agents.find((candidate) => candidate.id === id);

  useEffect(() => {
    if (agent) setSelectedAgentId(agent.id);
  }, [agent, setSelectedAgentId]);

  return (
    <AdaptiveShell title={agent?.name ?? 'Agent'}>
      {agent ? (
        <AgentDetailView agent={agent} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.textMuted }}>Agent unavailable.</Text>
        </View>
      )}
    </AdaptiveShell>
  );
}
