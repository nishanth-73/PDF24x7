import { Redirect, router, useLocalSearchParams } from 'expo-router';
import ToolRunner from '../../src/ToolRunner';
import { Screen } from '../../src/ui';
import { toolById } from '../../src/tools';

export default function ToolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tool = toolById(id);
  if (!tool) return <Redirect href="/" />;
  return (
    <Screen edges={['top', 'bottom']}>
      <ToolRunner key={tool.id} tool={tool} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
