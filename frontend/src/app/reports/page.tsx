'use client';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useRef } from 'react';
// @ts-ignore
import jsPDF from 'jspdf';
// @ts-ignore
import html2canvas from 'html2canvas';

interface ReportResponse {
  reply: string;
  route: string;
  intent: string;
  actions?: Array<{
    type: string;
    status: string;
    payload?: any;
  }>;
  followups?: Array<{
    type: string;
    text: string;
  }>;
}

export default function ReportsPage() {
  const { user, providerToken } = useAuth();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('today');
  const [selectedFocus, setSelectedFocus] = useState<string>('overall');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const timeframes = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'all_history', label: 'All History' },
  ];

  const focusOptions = [
    { value: 'overall', label: 'Overall' },
    { value: 'cognitive', label: 'Cognitive' },
    { value: 'mental', label: 'Mental Health' },
    { value: 'physical', label: 'Physical Health' },
  ];

  const generateReport = async () => {
    if (!user?.id) {
      setError('User information not found.');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const base =
        process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

      // Generate message that ReportAgent can understand
      const reportMessage = `Generate a ${selectedFocus} report for ${selectedTimeframe}`;

      const response = await fetch(`${base}/agents/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(providerToken && { Authorization: `Bearer ${providerToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: user.id,
          sessionId: `report-${Date.now()}`,
          message: reportMessage,
          metadata: {
            timeframe: selectedTimeframe,
            focus: selectedFocus,
            source: 'reports_page',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ReportResponse = await response.json();
      setReport(data);
    } catch (err) {
      console.error('Report generation failed:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred while generating the report.'
      );
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!report || !reportRef.current) return null;

    const element = reportRef.current;

    // Wait a bit for any dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simple html2canvas configuration
    const canvas = await html2canvas(element, {
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      removeContainer: true,
      foreignObjectRendering: false,
      onclone: (clonedDoc) => {
        // Remove all stylesheets that might contain lab() functions
        const stylesheets = clonedDoc.querySelectorAll(
          'link[rel="stylesheet"], style'
        );
        stylesheets.forEach((sheet) => sheet.remove());

        // Add a simple CSS reset to avoid lab() functions
        const style = clonedDoc.createElement('style');
        style.textContent = `
          * {
            color: #000000 !important;
            background-color: #ffffff !important;
            border-color: #e5e7eb !important;
          }
          .bg-blue-50 { background-color: #eff6ff !important; }
          .bg-green-50 { background-color: #f0fdf4 !important; }
          .bg-yellow-50 { background-color: #fefce8 !important; }
          .bg-red-50 { background-color: #fef2f2 !important; }
          .bg-gray-50 { background-color: #f9fafb !important; }
          .text-blue-600 { color: #2563eb !important; }
          .text-green-600 { color: #16a34a !important; }
          .text-yellow-600 { color: #ca8a04 !important; }
          .text-red-600 { color: #dc2626 !important; }
          .text-gray-600 { color: #4b5563 !important; }
          .text-gray-800 { color: #1f2937 !important; }
          .text-gray-500 { color: #6b7280 !important; }
          .border-gray-200 { border-color: #e5e7eb !important; }
          .border { border: 1px solid #e5e7eb !important; }
          .rounded { border-radius: 0.25rem !important; }
          .p-4 { padding: 1rem !important; }
          .p-6 { padding: 1.5rem !important; }
          .mb-4 { margin-bottom: 1rem !important; }
          .mb-6 { margin-bottom: 1.5rem !important; }
          .text-lg { font-size: 1.125rem !important; }
          .text-xl { font-size: 1.25rem !important; }
          .text-2xl { font-size: 1.5rem !important; }
          .font-bold { font-weight: 700 !important; }
          .font-semibold { font-weight: 600 !important; }
        `;
        clonedDoc.head.appendChild(style);
      },
    });

    // Check if canvas has content
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('Canvas has zero dimensions');
    }

    // Convert to image with higher quality
    const imgData = canvas.toDataURL('image/jpeg', 0.9);

    // Validate the image data
    if (!imgData || imgData.length < 100) {
      throw new Error('Failed to generate valid image data');
    }

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;

    // Calculate image dimensions to fit page
    const imgWidth = pageWidth - 20; // 10mm margin on each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add image to PDF
    pdf.addImage(imgData, 'JPEG', 10, 10, imgWidth, imgHeight);

    return pdf;
  };

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const pdf = await generatePDF();
      if (!pdf) return;

      const fileName = `health-report-${selectedFocus}-${selectedTimeframe}-${
        new Date().toISOString().split('T')[0]
      }.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF generation failed:', error);
      setError(
        `An error occurred while generating PDF: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setDownloading(false);
    }
  };

  const viewPDF = async () => {
    setDownloading(true);
    try {
      const pdf = await generatePDF();
      if (!pdf) return;

      // Generate PDF blob
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);

      // Open in new window
      const newWindow = window.open(pdfUrl, '_blank');
      if (!newWindow) {
        setError('Popup blocked. Please disable popup blocking.');
        return;
      }

      // Clean up URL after a delay
      setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 1000);
    } catch (error) {
      console.error('PDF generation failed:', error);
      setError(
        `An error occurred while generating PDF: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setDownloading(false);
    }
  };

  const formatReportText = (text: string) => {
    const parseInlineMarkdown = (line: string) => {
      // Handle bold text **text**
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Handle italic text *text*
      line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
      // Handle code `text`
      line = line.replace(
        /`(.*?)`/g,
        '<code class="bg-gray-200 px-1 py-0.5 rounded text-sm">$1</code>'
      );
      return line;
    };

    return text.split('\n').map((line, index) => {
      if (line.startsWith('##')) {
        return (
          <h3
            key={index}
            className="text-lg font-semibold mt-4 mb-2 text-blue-600"
            dangerouslySetInnerHTML={{
              __html: parseInlineMarkdown(line.replace('##', '').trim()),
            }}
          />
        );
      }
      if (line.startsWith('#')) {
        return (
          <h2
            key={index}
            className="text-xl font-bold mt-6 mb-3 text-blue-800"
            dangerouslySetInnerHTML={{
              __html: parseInlineMarkdown(line.replace('#', '').trim()),
            }}
          />
        );
      }
      if (line.startsWith('-') || line.startsWith('•')) {
        return (
          <li
            key={index}
            className="ml-4 mb-1"
            dangerouslySetInnerHTML={{
              __html: parseInlineMarkdown(line.replace(/^[-•]\s*/, '')),
            }}
          />
        );
      }
      if (line.trim() === '') {
        return <br key={index} />;
      }
      return (
        <p
          key={index}
          className="mb-2"
          dangerouslySetInnerHTML={{
            __html: parseInlineMarkdown(line),
          }}
        />
      );
    });
  };

  return (
    <ProtectedRoute>
      <main className="mx-auto p-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6 text-neutral-900">
            Health Reports
          </h1>

          {/* Report Generation Section */}
          <section className="bg-white shadow-sm border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-medium mb-4 text-neutral-900">
              Report Settings
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Period
                </label>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-neutral-900"
                >
                  {timeframes.map((tf) => (
                    <option key={tf.value} value={tf.value}>
                      {tf.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Focus Area
                </label>
                <select
                  value={selectedFocus}
                  onChange={(e) => setSelectedFocus(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-neutral-900"
                >
                  {focusOptions.map((focus) => (
                    <option key={focus.value} value={focus.value}>
                      {focus.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={generateReport}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Generating Report...' : 'Generate Report'}
            </button>
          </section>

          {/* Error Message */}
          {error && (
            <section className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Error Occurred
                  </h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </section>
          )}

          {/* Report Results */}
          {report && (
            <section className="bg-white shadow-sm border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-neutral-900">
                  Report Results
                </h2>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={viewPDF}
                    disabled={downloading}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    <span>
                      {downloading ? 'Generating PDF...' : 'View PDF'}
                    </span>
                  </button>
                  <button
                    onClick={downloadPDF}
                    disabled={downloading}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>
                      {downloading ? 'Generating PDF...' : 'Download PDF'}
                    </span>
                  </button>
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                      {report.route}
                    </span>
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                      {report.intent}
                    </span>
                  </div>
                </div>
              </div>

              {/* Report Period Information */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <svg
                        className="w-4 h-4 text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">
                        Period:
                      </span>
                      <span className="text-sm text-gray-900">
                        {timeframes.find((tf) => tf.value === selectedTimeframe)
                          ?.label || selectedTimeframe}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <svg
                        className="w-4 h-4 text-blue-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">
                        Focus:
                      </span>
                      <span className="text-sm text-gray-900">
                        {focusOptions.find(
                          (focus) => focus.value === selectedFocus
                        )?.label || selectedFocus}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Generated at {new Date().toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="prose max-w-none" ref={reportRef}>
                <div className="bg-gray-50 rounded-lg p-4 mb-4 text-neutral-900 overflow-y-auto">
                  {formatReportText(report.reply)}
                </div>
              </div>

              {/* Action Information */}
              {report.actions && report.actions.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">
                    Actions Performed:
                  </h4>
                  <ul className="space-y-1">
                    {report.actions.map((action, index) => (
                      <li key={index} className="text-sm text-blue-800">
                        • {action.type}: {action.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Follow-up Questions */}
              {report.followups && report.followups.length > 0 && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">
                    Follow-up Questions:
                  </h4>
                  <ul className="space-y-1">
                    {report.followups.map((followup, index) => (
                      <li key={index} className="text-sm text-green-800">
                        • {followup.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Usage Instructions */}
          {!report && !loading && !error && (
            <section className="bg-white shadow-sm border rounded-lg p-6">
              <h2 className="text-lg font-medium mb-4 text-neutral-900">
                Usage Instructions
              </h2>
              <div className="text-gray-600 space-y-2">
                <p>
                  • Select the settings above and click the "Generate Report"
                  button.
                </p>
                <p>
                  • A personalized health report will be generated based on your
                  selected time period and focus area.
                </p>
                <p>• Reports are generated based on AI-analyzed data.</p>
              </div>
            </section>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
