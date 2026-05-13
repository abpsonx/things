"use client";

import React from "react";
import ProjectLayout from "@/components/layout/ProjectLayout";

export default function ProjectNestedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProjectLayout>{children}</ProjectLayout>;
}
