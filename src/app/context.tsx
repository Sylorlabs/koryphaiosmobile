import React from 'react';
import { Redirect } from 'expo-router';

export default function ContextScreen() {
  return <Redirect href="/workspace?context=1" />;
}
