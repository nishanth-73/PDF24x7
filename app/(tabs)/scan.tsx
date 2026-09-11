import ToolRunner from '../../src/ToolRunner';
import { Screen } from '../../src/ui';
import { toolById } from '../../src/tools';

const scan = toolById('scan')!;

export default function ScanTab() {
  return (
    <Screen>
      <ToolRunner tool={scan} />
    </Screen>
  );
}
