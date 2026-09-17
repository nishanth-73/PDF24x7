import { useRef } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import ToolRunner from '../../src/ToolRunner';
import { Screen } from '../../src/ui';
import { toolById } from '../../src/tools';

export default function ToolScreen() {
  const { id, resume } = useLocalSearchParams<{ id: string; resume?: string }>();
  const tool = toolById(id);
  const left = useRef(false); // taps queue up while a big PDF keeps JS busy; a second back would have nothing to pop
  const back = () => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  if (!tool) return <Redirect href="/" />;
  return (
    <Screen edges={['top', 'bottom']}>
      <ToolRunner key={tool.id} tool={tool} resume={resume === '1'} onBack={back} />
    </Screen>
  );
}
