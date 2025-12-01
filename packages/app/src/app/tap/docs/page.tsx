'use client';

import { useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function DocsPage() {
	useEffect(() => {
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
		document.body.appendChild(script);
		return () => {
			document.body.removeChild(script);
		};
	}, []);

	return (
		<div className="min-h-screen">
			<script id="api-reference" data-url={`${API_URL}/tap/openapi.json`} />
		</div>
	);
}
