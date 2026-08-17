import { createRoute } from '@granite-js/react-native';
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { formatRemaining, serviceDateKST, SESSION_MS } from '@onehour/domain';

export const Route = createRoute('/', {
  component: Page,
});

/**
 * 모노레포 해석 확인용 임시 화면.
 * @onehour/domain 은 SQL 생성 컬럼의 TS 미러이므로 웹과 미니앱이 반드시 같은 소스를 써야 한다.
 * Metro 가 워크스페이스 밖 심볼릭 링크를 따라가는지를 여기서 확정한다.
 */
function Page() {
  const today = serviceDateKST(new Date());
  const full = formatRemaining(SESSION_MS);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>하루에 하나씩</Text>
      <Text style={styles.mono}>{full}</Text>
      <Text style={styles.caption}>서비스일 {today}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 20, color: '#171717' },
  mono: { fontSize: 48, fontVariant: ['tabular-nums'], color: '#171717' },
  caption: { fontSize: 13, color: '#737373' },
});
