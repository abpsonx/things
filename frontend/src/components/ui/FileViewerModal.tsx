"use client";

import React, { useEffect, useCallback } from "react";
import { X, Download, FileText, File, Image, Video, Music } from "lucide-react";

interface FileViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileUrl: string;
    fileName: string;
    isImage?: boolean;
    isVideo?: boolean;
    isAudio?: boolean;
    isPdf?: boolean;
}

export default function FileViewerModal({ isOpen, onClose, fileUrl, fileName, isImage, isVideo, isAudio, isPdf }: FileViewerModalProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const getFileIcon = () => {
        if (isImage) return <Image className="w-16 h-16 text-muted-foreground" />;
        if (isVideo) return <Video className="w-16 h-16 text-muted-foreground" />;
        if (isAudio) return <Music className="w-16 h-16 text-muted-foreground" />;
        if (isPdf) return <FileText className="w-16 h-16 text-muted-foreground" />;
        return <File className="w-16 h-16 text-muted-foreground" />;
    };

    const getFileType = () => {
        if (isImage) return "Gambar";
        if (isVideo) return "Video";
        if (isAudio) return "Audio";
        if (isPdf) return "PDF";
        return "File";
    };

    const formatFileSize = (url: string) => {
        // We don't have size here, but we can return empty
        return "";
    };

    const isPreviewable = isImage || isVideo || isAudio || isPdf;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative max-w-[90vw] max-h-[90vh] flex flex-col bg-background rounded-2xl overflow-hidden shadow-2xl border border-border animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-lg bg-secondary/50">
                            {getFileIcon()}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold truncate max-w-[300px]">{fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{getFileType()}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={fileUrl}
                            download={fileName}
                            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                            title="Unduh file"
                        >
                            <Download className="w-5 h-5" />
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 bg-secondary/10 flex items-center justify-center min-h-[200px]">
                    {isPreviewable ? (
                        <>
                            {isImage && (
                                <img
                                    src={fileUrl}
                                    alt={fileName}
                                    className="max-w-full max-h-[65vh] rounded-xl object-contain"
                                    onClick={() => window.open(fileUrl, "_blank")}
                                    style={{ cursor: "pointer" }}
                                />
                            )}
                            {isVideo && (
                                <video
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-[65vh] rounded-xl"
                                >
                                    <source src={fileUrl} />
                                    Browser tidak mendukung video.
                                </video>
                            )}
                            {isAudio && (
                                <div className="flex flex-col items-center gap-4 p-8">
                                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                                        <Music className="w-12 h-12 text-primary" />
                                    </div>
                                    <p className="text-sm font-bold">{fileName}</p>
                                    <audio controls autoPlay className="w-full max-w-sm">
                                        <source src={fileUrl} />
                                        Browser tidak mendukung audio.
                                    </audio>
                                </div>
                            )}
                            {isPdf && (
                                <iframe
                                    src={fileUrl}
                                    className="w-full h-[65vh] rounded-xl"
                                    title={fileName}
                                />
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-4 p-8">
                            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                                <File className="w-12 h-12 text-primary" />
                            </div>
                            <p className="text-sm text-muted-foreground text-center">
                                Pratinjau tidak tersedia untuk file ini
                            </p>
                            <a
                                href={fileUrl}
                                download={fileName}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:shadow-lg transition-all text-sm font-bold"
                            >
                                <Download className="w-4 h-4" />
                                Unduh File
                            </a>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 border-t border-border bg-card flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{fileName}</span>
                    <a
                        href={fileUrl}
                        download={fileName}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                        <Download className="w-3 h-3" />
                        Unduh
                    </a>
                </div>
            </div>
        </div>
    );
}