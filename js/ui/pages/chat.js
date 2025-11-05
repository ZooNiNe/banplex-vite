import { appState } from "../../state/appState.js";
import { $, $$ } from "../../utils/dom.js";
import { toast, hideToast } from "../components/toast.js";
import { getJSDate, generateUUID, getUnreadCommentCount } from "../../utils/helpers.js";
import { _getSkeletonLoaderHTML, createListSkeletonHTML } from "../components/skeleton.js";
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from "../components/emptyState.js";
import { transitionContent } from "../../utils/dom.js";
import { _setActiveListeners, setCommentsScope, requestSync } from "../../services/syncService.js";
import { localDB, loadAllLocalDataToState, loadDataForPage } from "../../services/localDbService.js";
import { showDetailPane, createModal, closeModalImmediate, closeDetailPane } from "../components/modal.js";
import { displayActions } from "../actionMenuUtils.js";
import { handlePostComment, handleDeleteComment, handleEditComment } from "../../services/data/commentService.js";
import { on, off, emit } from "../../state/eventBus.js";
import { createPageToolbarHTML } from "../components/toolbar.js";
import { liveQueryMulti } from "../../state/liveQuery.js";
import { queueOutbox } from "../../services/outboxService.js";
import { createMasterDataSelect, initCustomSelects } from "../components/forms/index.js";
import { formatRelativeTime } from "../../utils/formatters.js";
import { initInfiniteScroll } from "../components/infiniteScroll.js";

let pageController = null;
let lqUnsub = null;
let busUnsubs = [];
let searchPageContainer = null;
let chatObserverInstance = null;
const CHAT_ITEMS_PER_PAGE = 20;

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
        send: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send-horizontal ${classes}"><path d="M3 3v18l18-9L3 3z"/><path d="M12 9v6"/></svg>`,
        'message-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square-icon lucide-messages-square"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
        engineering: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        description: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text ${classes}"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
        schedule: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock ${classes}"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        done_all: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check ${classes}"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle ${classes}" style="color: var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-reply-icon lucide-message-square-reply"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="m10 8-3 3 3 3"/><path d="M17 14v-1a2 2 0 0 0-2-2H7"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search ${classes}"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        store: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store ${classes}"><path d="M20 7l-2 12H6L4 7"/><path d="M2 7h20"/><path d="M16 7V3H8v4"/></svg>`,
        receipt: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt ${classes}"><path d="M4 2v20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V2Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        piggy_bank: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-piggy-bank ${classes}"><path d="M19 5c-1.3-.8-3-1-4.5-.3C12.9 3.8 11.5 3 10 3 7.2 3 5 5.2 5 8c0 .7.2 1.4.5 2-.9.7-1.5 1.8-1.5 3 0 2.2 1.8 4 4 4h7c2.2 0 4-1.8 4-4 0-.8-.3-1.6-.7-2.2.7-.5 1.2-1.3 1.2-2.3 0-1.2-.7-2.1-1.5-2.5Z"/><path d="M2 9h2"/><path d="M3 13v2"/><circle cx="16" cy="7" r="1"/></svg>`,
        hard_hat: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat ${classes}"><path d="M2 18v-3a10 10 0 0 1 20 0v3"/><path d="M10 10V5h4v5"/><rect x="2" y="18" width="20" height="3" rx="1"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        'check-square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square ${classes}"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy ${classes}"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        'arrow_back': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left ${classes}"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
        'thumbs-up': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-thumbs-up-icon lucide-thumbs-up"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    };
    return icons[iconName] || '';
}

function _getAttachmentHTML(attachment) {
    if (attachment.type === 'quote') {
        const sender = attachment.sender || 'Pengguna';
        const text = (attachment.text || '').replace(/</g, '&lt;');
        return `<div class="attachments"><div class="quote"><div class="q-sender">${sender}</div><div class="q-text reply-quote-text">${text}</div></div></div>`;
    }
    return '';
}

function _buildCommentHTML(comment, currentUid, level = 0) {
    const ts = getJSDate(comment.createdAt).getTime();
    const dir = (comment.userId === currentUid) ? 'outgoing' : 'incoming';
    const timeStr = formatRelativeTime(getJSDate(comment.createdAt));
    const contentWithMentions = (comment.content || '').replace(/</g, '&lt;');
    
    const user = (appState.users || []).find(u => u.id === comment.userId);
    const photoURL = user?.photoURL;
    const initials = (comment.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    const avatarHTML = photoURL
        ? `<img src="${photoURL}" alt="${initials}" class="avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <span class="avatar-initials" style="display:none;">${initials}</span>`
        : `<span class="avatar-initials">${initials}</span>`;
    
    const tickIconName = (comment.syncState === 'pending_create') ? 'schedule'
                       : (comment.syncState === 'failed' ? 'error' : 'done_all');
    const tickIcon = (dir === 'outgoing') ? createIcon(tickIconName, 16) : '';
    const ticksHTML = (dir === 'outgoing') 
        ? `<span class="ticks" ${comment.syncState === 'failed' ? `data-action="retry-comment"` : ''}>${tickIcon}</span>` 
        : '';
    
    const attachHTML = comment.attachments ? _getAttachmentHTML(comment.attachments) : '';
    
    const quoteFirst = (comment.attachments && comment.attachments.type === 'quote')
        ? `${attachHTML}${comment.content ? `<div class="content selectable-text">${contentWithMentions}</div>` : ''}`
        : `${comment.content ? `<div class="content selectable-text">${contentWithMentions}</div>` : ''}${attachHTML || ''}`;

        appState.commentLikes = appState.commentLikes || new Set();
        const isLiked = appState.commentLikes.has(comment.id || comment.clientMsgId);
        const likeIconClass = isLiked ? 'filled' : '';
        const likeButtonClass = isLiked ? 'liked' : '';
    
        let actionsHTML = '';
        if (dir === 'incoming' || (dir === 'outgoing' && comment.syncState !== 'failed')) {
            actionsHTML = `<button class="btn-icon" data-action="reply-comment" data-msg-id="${comment.id || comment.clientMsgId}" data-sender="${(comment.userName || 'Pengguna').replace(/"/g, '&quot;')}" data-text="${(comment.content || '').slice(0, 120).replace(/"/g, '&quot;')}" title="Balas">${createIcon('reply', 18)}</button>`;
        } else if (comment.syncState === 'failed') {
            actionsHTML = `<button class="btn-text danger" data-action="retry-comment">Gagal, coba lagi</button>`;
        }
    
        if (comment.syncState !== 'failed') {
            actionsHTML += `<button class="btn-icon ${likeButtonClass}" data-action="like-comment" data-msg-id="${comment.id || comment.clientMsgId}" title="Suka">${createIcon('thumbs-up', 18, likeIconClass)}</button>`;
        }
    
        const animClass = (dir === 'outgoing' && comment.syncState === 'pending_create') ? 'msg-anim-sent' : '';
        const editedLabel = comment.isEdited ? '<span class="edited-label">(diedit)</span>' : '';

    return `
        <div class="msg-group ${animClass}" data-msg-id="${comment.id || comment.clientMsgId}" data-user-id="${comment.userId}" data-timestamp="${ts}" data-level="${level}" style="--level: ${level};" tabindex="0">
            <div class="avatar">${avatarHTML}</div>
            <div class="comment-main">
                <div class="comment-header">
                    <span class="sender">${comment.userName || 'Pengguna'}</span>
                    <time>${timeStr}</time>
                    ${editedLabel} 
                    ${ticksHTML}
                </div>
                <div class="comment-content">
                    ${quoteFirst}
                </div>
                <div class="comment-actions">
                    ${actionsHTML}
                </div>
            </div>
            <div class="comment-menu">
                <button class="btn-icon" data-action="open-comment-menu" title="Opsi">${createIcon('more-vertical', 18)}</button>
            </div>
        </div>
    `;
}

function _buildCommentTreeHTML(comment, repliesMap, currentUid, level) {
    const commentHTML = _buildCommentHTML(comment, currentUid, level);
    
    const children = repliesMap.get(comment.id) || [];
    let repliesHTML = '';

    if (children.length > 0) {
        const childrenHTML = children
            .map(child => _buildCommentTreeHTML(child, repliesMap, currentUid, level + 1))
            .join('');
        
        repliesHTML = `
            <div class="comment-replies" data-parent-id="${comment.id}">
                ${childrenHTML}
            </div>
        `;
    }

    return commentHTML + repliesHTML;
}

function upsertCommentInUI(commentData, changeType, list, replyToId = null) {
    try {
        if (!list || !list.isConnected) {
            return; 
        }

        const placeholder = list.querySelector('.empty-state');
        if (placeholder) placeholder.remove();

        let existing = list.querySelector(`.msg-group[data-msg-id="${commentData.id}"]`);
        if (!existing && commentData.clientMsgId) {
            existing = list.querySelector(`.msg-group[data-msg-id="${commentData.clientMsgId}"]`);
            if (existing) {
                existing.dataset.msgId = commentData.id;
            }
        }

        if (changeType === 'removed' || commentData.isDeleted) {
            if (existing) {
                const replyContainer = existing.nextElementSibling;
                if (replyContainer && replyContainer.classList.contains('comment-replies')) {
                    replyContainer.remove();
                }
                existing.remove();
            }
            return;
        }
        
        const currentUid = appState.currentUser?.uid || 'user-guest';
        
        if (existing) {
            if (changeType === 'modified') {
                if (commentData.content !== undefined) {
                    const contentEl = existing.querySelector('.comment-content .content');
                    if (contentEl) {
                        contentEl.innerHTML = (commentData.content || '').replace(/</g, '&lt;');
                    }
                }
                
                const headerEl = existing.querySelector('.comment-header');
                const editedEl = headerEl ? headerEl.querySelector('.edited-label') : null;
                if (commentData.isEdited && !editedEl) {
                    const timeEl = headerEl.querySelector('time');
                    if (timeEl) timeEl.insertAdjacentHTML('afterend', '<span class="edited-label">(diedit)</span>');
                } else if (!commentData.isEdited && editedEl) {
                    editedEl.remove();
                }

                const timeEl = headerEl?.querySelector('time');
                if (timeEl && commentData.createdAt) {
                    const newTimeStr = formatRelativeTime(getJSDate(commentData.createdAt));
                    if (timeEl.textContent !== newTimeStr) {
                        timeEl.textContent = newTimeStr;
                    }
                }
            }

            const isMyMessage = commentData.userId === currentUid;
            if (isMyMessage) {
                const ticksContainer = existing.querySelector('.ticks');
                if (ticksContainer) {
                    const syncIconName = commentData.syncState === 'pending_create' ? 'schedule'
                                       : (commentData.syncState === 'failed' ? 'error' : 'done_all');
                    
                    const ticksHTML = createIcon(syncIconName, 16);
                    if (ticksContainer.innerHTML !== ticksHTML) {
                        ticksContainer.innerHTML = ticksHTML;
                    }
                    if (commentData.syncState === 'failed') {
                        ticksContainer.dataset.action = 'retry-comment';
                    } else {
                        delete ticksContainer.dataset.action;
                    }
                }
                const actionsContainer = existing.querySelector('.comment-actions');
                if(actionsContainer) {
                    if (commentData.syncState === 'failed') {
                        actionsContainer.innerHTML = `<button class="btn-text danger" data-action="retry-comment">Gagal, coba lagi</button>`;
                    } else {
                        const replyBtn = actionsContainer.querySelector('[data-action="reply-comment"]');
                        if (!replyBtn) {
                             const likeBtnHTML = actionsContainer.querySelector('[data-action="like-comment"]')?.outerHTML || '';
                             actionsContainer.innerHTML = `<button class="btn-icon" data-action="reply-comment" data-msg-id="${commentData.id || commentData.clientMsgId}" ... (data lain) ...>${createIcon('reply', 18)}</button>` + likeBtnHTML;
                        }
                    }
                }
            }
            if (commentData.syncState !== 'pending_create') {
                existing.classList.remove('msg-anim-sent');
            }
            return;
        }

        // --- LOGIKA KOMENTAR BARU ---
        const parentIdToFind = commentData.replyToId || replyToId;
        
        if (parentIdToFind) {
            const parentEl = list.querySelector(`.msg-group[data-msg-id="${parentIdToFind}"]`);
            
            if (parentEl) {
                const parentLevel = parseInt(parentEl.dataset.level || '0');
                const newLevel = parentLevel + 1;
                
                let replyContainer = parentEl.nextElementSibling;
                if (!replyContainer || !replyContainer.classList.contains('comment-replies')) {
                    replyContainer = document.createElement('div');
                    replyContainer.className = 'comment-replies';
                    replyContainer.dataset.parentId = parentIdToFind;
                    parentEl.after(replyContainer);
                }

                const newHtml = _buildCommentTreeHTML(commentData, new Map(), currentUid, newLevel);
                replyContainer.insertAdjacentHTML('beforeend', newHtml);
                
                const newEl = list.querySelector(`.msg-group[data-msg-id="${commentData.id || commentData.clientMsgId}"]`);
                if (newEl) {
                    newEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                return;
            } else {
            }
        }

        const ts = getJSDate(commentData.createdAt).getTime();
        const newHtml = _buildCommentTreeHTML(commentData, new Map(), currentUid, 0);

        try {
            const dateKey = new Date(ts).toISOString().slice(0, 10);
            const firstSep = list.querySelector('.date-separator:first-of-type');
            if (!firstSep || firstSep.getAttribute('data-date') !== dateKey) {
                const label = new Date(ts).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                list.insertAdjacentHTML('afterbegin', `<div class="date-separator" data-date="${dateKey}"><span>${label}</span></div>`);
            }
        } catch (_) {}
        
        const firstSep = list.querySelector('.date-separator:first-of-type');
        if (firstSep) {
            firstSep.insertAdjacentHTML('afterend', newHtml);
        } else {
            list.insertAdjacentHTML('afterbegin', newHtml);
        }
        
        requestAnimationFrame(() => {
            try { 
                list.scrollTop = 0; 
            } catch (_) {}
        });

    } catch (e) {
        console.error("[upsertCommentInUI] Error besar:", e);
    }
}

function _setLastCommentViewTimestamp(parentId) {
    if (!parentId) return;
    try {
      const key = `comment_view_ts_${parentId}`;
      localStorage.setItem(key, Date.now().toString());
      emit('ui.dashboard.updateCommentsBadge');
    } catch (e) {
    }
}

function _getCommentThreadContext(parentId, parentType) {
    let threadTitle = 'Komentar Item';
    let iconName = 'message-circle';
    let itemTypeLabel = 'Item';
    let detailAction = null;
    
    if (parentType === 'bill') {
        const item = (appState.bills || []).find(b => b.id === parentId);
        threadTitle = item?.description || 'Tagihan';
        iconName = 'receipt';
        itemTypeLabel = 'Tagihan';
        detailAction = { action: 'open-bill-detail', itemId: parentId, expenseId: item?.expenseId || '' };
    } else if (parentType === 'expense') {
        const item = (appState.expenses || []).find(e => e.id === parentId);
        threadTitle = item?.description || 'Pengeluaran';
        iconName = 'store';
        itemTypeLabel = 'Pengeluaran';
        detailAction = { action: 'open-bill-detail', itemId: '', expenseId: parentId };
    } else if (parentType === 'loan') {
        const item = (appState.fundingSources || []).find(f => f.id === parentId);
        threadTitle = item?.description || 'Pinjaman';
        iconName = 'piggy_bank';
        itemTypeLabel = 'Pinjaman';
        detailAction = { action: 'open-pemasukan-detail', itemId: parentId, type: 'pinjaman' };
    } else if (parentType === 'journal') {
        threadTitle = 'Jurnal';
        iconName = 'hard_hat';
        itemTypeLabel = 'Jurnal Harian';
    }

    return { threadTitle, iconName, itemTypeLabel, detailAction };
}

function _renderCommentsViewChat(parentId, parentType, paginationState = null) {
    const all = (appState.comments || [])
        .filter(c => c.parentId === parentId && c.parentType === parentType && !c.isDeleted);

    const commentsById = new Map(all.map(c => [c.id, c]));
    const repliesMap = new Map();
    const topLevelComments = [];

    all.forEach(c => {
        if (c.replyToId && commentsById.has(c.replyToId)) {
            const children = repliesMap.get(c.replyToId) || [];
            children.push(c);
            repliesMap.set(c.replyToId, children);
        } else {
            topLevelComments.push(c);
        }
    });

    topLevelComments.sort((a, b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));

    repliesMap.forEach(children => {
        children.sort((a, b) => getJSDate(a.createdAt) - getJSDate(b.createdAt));
    });
    
    let itemsToRender = topLevelComments;
    if (paginationState) {
        const endIndex = (paginationState.page + 1) * CHAT_ITEMS_PER_PAGE;
        itemsToRender = topLevelComments.slice(0, endIndex);
        paginationState.hasMore = endIndex < topLevelComments.length;
    }

    const { threadTitle, iconName } = _getCommentThreadContext(parentId, parentType);
    const currentUid = appState.currentUser?.uid || 'user-guest';
    
    const itemsHTML = (function buildChatHTMLWithDates() {
        let lastDateKey = '';
        const parts = [];
        
        itemsToRender.forEach(comment => {
            const ts = getJSDate(comment.createdAt).getTime();
            const dateKey = new Date(ts).toISOString().slice(0, 10);
            if (dateKey !== lastDateKey) {
                const label = new Date(ts).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                parts.push(`<div class="date-separator" data-date="${dateKey}"><span>${label}</span></div>`);
                lastDateKey = dateKey;
            }
            parts.push(_buildCommentTreeHTML(comment, repliesMap, currentUid, 0));
        });
        return parts.join('');
    })();

    const participantsCount = new Set(all.map(c => String(c.userId))).size;
    
    const contentHTML = `
        <div class="chat-bg" aria-hidden="true"></div>
        <main class="chat-thread" role="log" aria-live="polite">${itemsHTML || getEmptyStateHTML({
            icon: 'message-circle',
            title: 'Belum Ada Komentar',
            desc: 'Tulis komentar pertama untuk item ini.'
        })}</main>`;
    
    const footerHTML = `
        <div class="composer-wrapper">
          <footer class="composer" role="group" aria-label="Tulis Komentar">
            <div class="composer-row">
              <div class="composer-capsule" tabindex="0">
                <div id="reply-bar" class="reply-bar hidden">
                    <div class="rb-strip"></div>
                    <div class="rb-content">
                        <div class="rb-title">Membalas</div>
                        <div class="rb-text" id="reply-preview-text"></div>
                    </div>
                    <button class="btn-icon" data-action="cancel-reply" title="Batal">${createIcon('x', 18)}</button>
                </div>
                <textarea class="composer-input" rows="1" placeholder="Tulis komentar..."></textarea>
                <div class="composer-actions">
                  <button class="chat-send-btn" data-action="post-comment" data-parent-id="${parentId}" data-parent-type="${parentType}">${createIcon('send')}</button>
                </div>
              </div>
            </div>
          </footer>
        </div>`;

    const headerActions = `
          <div class="chat-header-default-actions">
            <button class="icon-btn" data-action="open-comments-search" title="Cari">${createIcon('search')}</button>
            <button class="icon-btn header-overflow-trigger" data-action="open-page-overflow" title="Opsi">${createIcon('more-vertical')}</button>
          </div>
        `;
          
    const subtitle = `<span class="chat-participants-count">${participantsCount} aktif</span>`;
    const customTitle = `<span class="avatar-badge is-icon">${createIcon(iconName, 18)}</span><div class="title-wrap"><strong class="chat-title">${threadTitle}</strong><span class="chat-subtitle">${subtitle}</span></div>`;

    return {
        title: customTitle,
        subtitle: subtitle,
        headerActions: headerActions,
        content: contentHTML,
        footer: footerHTML
    };
}

async function renderCommentsPage(parentId, parentType, append = false, modalEl) {

    const paginationKey = `comments_${parentId}`;
    const paginationState = appState.pagination[paginationKey];
    const list = modalEl.querySelector('.chat-thread');
    if (!paginationState || !list) return;

    if (!append) {
        paginationState.page = 0;
    } else {
        paginationState.page += 1;
    }
    
    const all = (await localDB.comments.where({ parentId: parentId, parentType: parentType, isDeleted: 0 }).toArray());
    
    const commentsById = new Map(all.map(c => [c.id, c]));
    const repliesMap = new Map();
    const topLevelComments = [];

    all.forEach(c => {
        if (c.replyToId && commentsById.has(c.replyToId)) {
            const children = repliesMap.get(c.replyToId) || [];
            children.push(c);
            repliesMap.set(c.replyToId, children);
        } else {
            topLevelComments.push(c);
        }
    });

    topLevelComments.sort((a, b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));

    repliesMap.forEach(children => {
        children.sort((a, b) => getJSDate(a.createdAt) - getJSDate(b.createdAt));
    });

    const startIndex = 0; 
    const endIndex = (paginationState.page + 1) * CHAT_ITEMS_PER_PAGE;
    const itemsToRender = topLevelComments.slice(startIndex, endIndex);
    paginationState.hasMore = endIndex < topLevelComments.length;

    const currentUid = appState.currentUser?.uid || 'user-guest';
    
    const itemsHTML = (function buildChatHTMLWithDates() {
        let lastDateKey = '';
        const parts = [];
        itemsToRender.forEach(comment => {
            const ts = getJSDate(comment.createdAt).getTime();
            const dateKey = new Date(ts).toISOString().slice(0, 10);
            if (dateKey !== lastDateKey) {
                const label = new Date(ts).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                parts.push(`<div class="date-separator" data-date="${dateKey}"><span>${label}</span></div>`);
                lastDateKey = dateKey;
            }
            parts.push(_buildCommentTreeHTML(comment, repliesMap, currentUid, 0));
        });
        return parts.join('');
    })();

    list.innerHTML = itemsHTML || getEmptyStateHTML({
        icon: 'message-circle',
        title: 'Belum Ada Komentar',
        desc: 'Tulis komentar pertama untuk item ini.'
    });

    list.querySelector('#list-skeleton')?.remove();
    const oldSentinel = list.querySelector('#infinite-scroll-sentinel');
    if (oldSentinel) {
        if (chatObserverInstance) chatObserverInstance.unobserve(oldSentinel);
        oldSentinel.remove();
    }

    if (paginationState.hasMore) {
        list.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
        const sentinel = document.createElement('div');
        sentinel.id = 'infinite-scroll-sentinel';
        sentinel.style.height = '10px';
        list.appendChild(sentinel);
        if (chatObserverInstance) chatObserverInstance.observe(sentinel);
    } else if (all.length > 0) {
        list.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
    }

    paginationState.isLoading = false;
    
    if (!append) {
        list.scrollTop = 0;
    }
}


export function _initChatViewInteractions(parentId, signal, containerElement) {
    if (!containerElement) {
        return;
    }

    const thread = containerElement.querySelector('.chat-thread');
    const composer = containerElement.querySelector('.composer');
    const textarea = composer?.querySelector('.composer-input');
    const sendBtn = composer?.querySelector('.chat-send-btn');
    const composerCapsule = composer?.querySelector('.composer-capsule');
    
    const headerSelectionToolbar = containerElement.querySelector('#chat-header-selection-toolbar');
    
    appState.commentLikes = appState.commentLikes || new Set();
    const selectedSet = new Set();

    if (!thread || !composer || !textarea || !sendBtn) {
        return;
    }

    setTimeout(() => { thread.scrollTop = 0; }, 100);
    try { _setLastCommentViewTimestamp(parentId); } catch (_) {}

    const updateComposerState = () => {
        const val = textarea.value.trim();
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
        const isEditing = sendBtn.dataset.action === 'post-edit-comment';
        sendBtn.disabled = !val && !isEditing;
    };

    textarea.addEventListener('input', updateComposerState, { signal });
    if (composerCapsule) {
        textarea.addEventListener('focus', () => composerCapsule.classList.add('is-focused'), { signal });
        textarea.addEventListener('blur', () => composerCapsule.classList.remove('is-focused'), { signal });
        composerCapsule.addEventListener('click', (e) => {
            if (!textarea.disabled) textarea.focus();
        }, { signal });
    }
    textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) sendBtn.click();
        }
        if (e.key === 'Escape') {
            const cancelReplyBtn = composer.querySelector('[data-action="cancel-reply"]');
            if (cancelReplyBtn) cancelReplyBtn.click();
            
            const cancelEditBtn = composer.querySelector('[data-action="cancel-edit"]');
            if (cancelEditBtn) cancelEditBtn.click();
        }
    }, { signal });

    updateComposerState();

    function updateSelectionToolbar() {
        if (!headerSelectionToolbar) return; 
        const hasSel = selectedSet.size > 0;
        headerSelectionToolbar.hidden = !hasSel;
        const countEl = headerSelectionToolbar.querySelector('#sel-count');
        if (countEl) countEl.textContent = String(selectedSet.size);
        containerElement.classList.toggle('selection-mode-active', hasSel);
    }
    
    function toggleSelectMsg(groupEl) {
        if (!headerSelectionToolbar) return; 
        if (!groupEl) return;
        const id = groupEl.getAttribute('data-msg-id');
        if (!id) return;
        if (selectedSet.has(id)) { selectedSet.delete(id); groupEl.classList.remove('selected'); }
        else { selectedSet.add(id); groupEl.classList.add('selected'); }
        updateSelectionToolbar();
    }

    thread.addEventListener('click', (e) => {
        const group = e.target.closest('.msg-group');
        const isMenuBtn = e.target.closest('[data-action="open-comment-menu"]'); 
        if (!group || isMenuBtn) return; 

        if (headerSelectionToolbar && containerElement.classList.contains('selection-mode-active')) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            toggleSelectMsg(group);
        }
    }, { signal });


    if (containerElement._chatClickHandler) {
        containerElement.removeEventListener('click', containerElement._chatClickHandler);
    }

    containerElement._chatClickHandler = async (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;
        
        if (actionTarget.disabled) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

        const action = actionTarget.dataset.action;
        const msgGroup = actionTarget.closest('.msg-group');
        const msgId = msgGroup?.dataset.msgId || actionTarget.dataset.msgId; 

        const cancelAllComposerModes = () => {
            const replyBar = composer.querySelector('#reply-bar');
            if (replyBar) { replyBar.classList.add('hidden'); replyBar.dataset.sender = ''; replyBar.dataset.text = ''; const pv = replyBar.querySelector('#reply-preview-text'); if (pv) pv.textContent = ''; }
            
            const editBar = composer.querySelector('#edit-bar');
            if (editBar) editBar.remove();
            
            sendBtn.dataset.action = 'post-comment';
            delete sendBtn.dataset.editId;
            delete sendBtn.dataset.replyToId;
            textarea.value = '';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        };

        switch (action) {
            case 'open-comment-menu':
                {
                    if (!msgId) break;
                    const comment = (appState.comments || []).find(c => c.id === msgId);
                    if (!comment) break;
                    
                    const isMyMessage = comment.userId === appState.currentUser?.uid;
                    let actions = [];
                    
                    actions.push({ icon: 'copy', label: 'Salin Teks', action: 'copy-comment', msgId: msgId });

                    if (isMyMessage) {
                        actions.push({ icon: 'edit', label: 'Edit', action: 'edit-comment', msgId: msgId });
                        actions.push({ icon: 'trash', label: 'Hapus', action: 'delete-comment', itemId: msgId, isDanger: true });
                    }
                    
                    displayActions(actions, actionTarget);
                    break;
                }
                case 'like-comment':
                    {
                        if (!msgId) break;
                        appState.commentLikes = appState.commentLikes || new Set();
                        const likeButton = actionTarget;
                        
                        if (appState.commentLikes.has(msgId)) {
                            appState.commentLikes.delete(msgId);
                            likeButton.classList.remove('liked');
                            likeButton.innerHTML = createIcon('thumbs-up', 18, '');
                        } else {
                            appState.commentLikes.add(msgId);
                            likeButton.classList.add('liked');
                            likeButton.innerHTML = createIcon('thumbs-up', 18, 'filled');
                        }
                        break;
                    }
    
            case 'cancel-selection':
                {
                    if (!headerSelectionToolbar) break; 
                    selectedSet.clear();
                    thread.querySelectorAll('.msg-group.selected').forEach(el => el.classList.remove('selected'));
                    updateSelectionToolbar();
                    break;
                }
            case 'delete-selected-comments':
                {
                    if (!headerSelectionToolbar) break; 
                    const ids = Array.from(selectedSet);
                    selectedSet.clear();
                    updateSelectionToolbar();
                    ids.forEach(id => { try { handleDeleteComment({ id }); } catch (_) {} });
                    break;
                }
            case 'select-all-comments':
                {
                    if (!headerSelectionToolbar) break; 
                    thread.querySelectorAll('.msg-group').forEach(el => {
                        const id = el.getAttribute('data-msg-id');
                        if (id && !selectedSet.has(id)) {
                            selectedSet.add(id);
                            el.classList.add('selected');
                        }
                    });
                    updateSelectionToolbar();
                    break;
                }

            case 'copy-comment':
                {
                    const comment = (appState.comments || []).find(c => c.id === msgId);
                    const text = comment?.content || '';
                    if (text) {
                        try { navigator.clipboard?.writeText(text); toast('info', 'Teks disalin'); } catch (_) {}
                    }
                    break;
                }
            
                case 'post-comment':
                    {
                        (async () => {
                            let attachmentData = null;
                            let replyToId = sendBtn.dataset.replyToId || null; 
                            
                            try {
                                if (sendBtn) sendBtn.disabled = true;
                                
                                const replyBar = composer.querySelector('#reply-bar');
                                if (replyBar && !replyBar.classList.contains('hidden')) {
                                    const sender = replyBar.dataset.sender || 'Pengguna';
                                    const text = replyBar.dataset.text || '';
                                    attachmentData = { type: 'quote', sender, text };
                                }
                                
                                await handlePostComment(sendBtn.dataset, attachmentData, replyToId); 
                                
                            } catch (e) {
                            } finally {
                                cancelAllComposerModes();
                            }
                        })();
                        break;
                    }            
            case 'post-edit-comment':
                {
                    const editId = sendBtn.dataset.editId;
                    const newContent = textarea.value.trim();
                    if (!editId) {
                        cancelAllComposerModes();
                        break;
                    }
                    
                    handleEditComment({ id: editId, content: newContent });
                    cancelAllComposerModes();
                    break;
                }
                
            case 'retry-comment':
                {
                    if (!msgId) break;
                    try {
                        const comment = await localDB.comments.get(msgId);
                        if (!comment) break;
                        const pendingComment = { ...comment, syncState: 'pending_create' };
                        await localDB.comments.update(msgId, { syncState: 'pending_create' });
                        
                        const list = containerElement.querySelector('.chat-thread[role="log"]');
                        if (list) {
                            upsertCommentInUI(pendingComment, 'modified', list);
                        }

                        await queueOutbox({ table: 'comments', docId: msgId, op: 'upsert', payload: comment, priority: 7 });
                        requestSync({ silent: true });
                    } catch (e) {
                    }
                    break;
                }
                case 'reply-comment':
                    {
                        const parentMsgId = actionTarget.dataset.msgId; 
                        if (!parentMsgId) break; 
    
                        const editBar = composer.querySelector('#edit-bar');
                        if (editBar) editBar.remove();
                        
                        const sender = actionTarget.dataset.sender || 'Pengguna';
                        const text = actionTarget.dataset.text || '';
                        let bar = composer.querySelector('#reply-bar');
                        if (!bar) {
                            bar = document.createElement('div');
                            bar.id = 'reply-bar';
                            bar.className = 'reply-bar';
                            bar.innerHTML = `
                                <div class="rb-strip"></div>
                                <div class="rb-content">
                                    <div class="rb-title">Membalas</div>
                                    <div class="rb-text" id="reply-preview-text"></div>
                                </div>
                                <button class="btn-icon" data-action="cancel-reply" title="Batal">${createIcon('x', 18)}</button>
                            `;
                            composer.querySelector('.composer-capsule').prepend(bar);
                        }
                        bar.classList.remove('hidden');
                        bar.dataset.sender = sender;
                        bar.dataset.text = text;
                        
                        const pv = bar.querySelector('#reply-preview-text');
                        if (pv) pv.textContent = `${sender}: ${text}`;
                        
                        sendBtn.dataset.action = 'post-comment';
                        sendBtn.dataset.replyToId = parentMsgId;
                        delete sendBtn.dataset.editId;
                        
                        textarea.focus();
                        break;
                    }
                case 'cancel-reply':
                    {
                        cancelAllComposerModes();
                        break;
                    }
            
            case 'edit-comment':
                {
                    if (!msgId) break;
                    const comment = (appState.comments || []).find(c => c.id === msgId);
                    if (!comment) break;
                    
                    const replyBar = composer.querySelector('#reply-bar');
                    if (replyBar) replyBar.classList.add('hidden');
                    
                    const oldEditBar = composer.querySelector('#edit-bar');
                    if (oldEditBar) oldEditBar.remove();

                    const bar = document.createElement('div');
                    bar.id = 'edit-bar';
                    bar.className = 'reply-bar is-editing';
                    bar.innerHTML = `
                        <div class="rb-strip"></div>
                        <div class="rb-content">
                            <div class="rb-title">Mengedit</div>
                            <div class="rb-text" id="edit-preview-text">${(comment.content || '').slice(0, 120).replace(/</g, '&lt;')}...</div>
                        </div>
                        <button class="btn-icon" data-action="cancel-edit" title="Batal">${createIcon('x', 18)}</button>
                    `;
                    composer.querySelector('.composer-capsule').prepend(bar);
                    
                    textarea.value = comment.content || '';
                    textarea.focus();
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    sendBtn.dataset.action = 'post-edit-comment';
                    sendBtn.dataset.editId = msgId;
                    delete sendBtn.dataset.replyToId;
                    sendBtn.disabled = false;
                    
                    break;
                }
            
            case 'cancel-edit':
                {
                    const bar = composer.querySelector('#edit-bar');
                    if (bar) bar.remove();
                    
                    textarea.value = '';
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    sendBtn.dataset.action = 'post-comment';
                    delete sendBtn.dataset.editId;
                    delete sendBtn.dataset.replyToId;
                    sendBtn.disabled = true;
                    break;
                }
            
            case 'delete-comment':
                {
                    const itemId = actionTarget.dataset.itemId;
                    if (itemId) {
                        try { handleDeleteComment({ id: itemId }); } catch (_) {}
                    }
                    break;
                }
        }
    };
    containerElement.addEventListener('click', containerElement._chatClickHandler, { signal });

    busUnsubs.push(() => {
        if (containerElement && containerElement._chatClickHandler && !signal.aborted) {
            containerElement.removeEventListener('click', containerElement._chatClickHandler);
            containerElement._chatClickHandler = null;
        }
    });
}

export async function initChatPage() {
    if (pageController) { try { pageController.abort(); } catch (_) {} }
    pageController = new AbortController();
    const { signal } = pageController;
    busUnsubs.forEach(fn => { try { fn(); } catch (_) {} });
    busUnsubs = [];
    if (lqUnsub) { try { lqUnsub.unsubscribe(); } catch (_) {} lqUnsub = null; }

    const unloadHandler = () => {
        try { pageController?.abort(); } catch (_) {}
        if (lqUnsub) { try { lqUnsub.unsubscribe(); } catch (_) {} lqUnsub = null; }
        busUnsubs.forEach(fn => { try { fn(); } catch (_) {} });
        busUnsubs = [];
        setCommentsScope(null);
        emit('ui.dashboard.updateCommentsBadge');
        
        off('app.unload.chat', unloadHandler);
    };
    on('app.unload.chat', unloadHandler);

    const container = $('.page-container');
    if (!container) return;
    container.className = 'page-container page-container--has-panel page-chat'; 

    if (!appState.comments || appState.comments.length === 0) {
        await loadDataForPage('Komentar');
    }

    if (!appState.users || appState.users.length === 0) {
        try {
            const { fetchAndCacheData } = await import("../../services/data/fetch.js");
            const { membersCol } = await import("../../config/firebase.js");
            await fetchAndCacheData('users', membersCol, 'name');
        } catch (e) {
        }
    }

    const { parentId, parentType, prefilledText } = appState.chatOpenRequest || {};
    appState.chatOpenRequest = null;

    if (!parentId) {
        container.innerHTML = getEmptyStateHTML({ title: 'Error', desc: 'Tidak ada chat yang dipilih.' });
        return;
    }

    const paginationKey = `comments_${parentId}`;
    appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
    const paginationState = appState.pagination[paginationKey];

    const view = _renderCommentsViewChat(parentId, parentType, paginationState);

    const pageToolbarHTML = `
        <div class="toolbar sticky-toolbar">
            <div class="toolbar-standard-actions">
                <div class="page-label">
                    <button class="btn-icon" data-action="navigate" data-nav="komentar" title="Kembali ke Daftar Komentar">
                        ${createIcon('arrow_back', 22)}
                    </button>
                    <div class="title-group">
                        <h4 id="page-label-name" class="page-name">${view.title}</h4>
                    </div>
                </div>
                <div class="header-actions">
                    ${view.headerActions || ''}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="content-panel chat-page-panel">
            ${pageToolbarHTML}
            <div id="sub-page-content" class="panel-body scrollable-content" style="padding: 0;">
                <div class="chat-view">
                    ${view.content}
                </div>
            </div>
            ${view.footer}
        </div>
    `;
    
    const list = container.querySelector('.chat-thread');
    if (list) {
        list.querySelector('#list-skeleton')?.remove();
        const oldSentinel = list.querySelector('#infinite-scroll-sentinel');
        if (oldSentinel) oldSentinel.remove();

        if (paginationState.hasMore) {
            list.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
            const sentinel = document.createElement('div');
            sentinel.id = 'infinite-scroll-sentinel';
            sentinel.style.height = '10px';
            list.appendChild(sentinel);
            if (chatObserverInstance) chatObserverInstance.disconnect();
            chatObserverInstance = initInfiniteScroll(container.querySelector('#sub-page-content'));
            if (chatObserverInstance) chatObserverInstance.observe(sentinel);
        } else if ((appState.comments || []).filter(c => c.parentId === parentId).length > 0) {
            list.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
        }
    }
    
    const loadMoreComments = () => {
        if (appState.activePage !== 'chat' || !appState._commentsScope || appState._commentsScope.parentId !== parentId) return;
        const state = appState.pagination[paginationKey];
        if (!state || state.isLoading || !state.hasMore) return;
        
        state.isLoading = true;
        const list = container.querySelector('.chat-thread');
        if (list && !list.querySelector('#list-skeleton')) {
            list.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
        }
        
        setTimeout(() => {
            renderCommentsPage(parentId, parentType, true, container.querySelector('.chat-view'));
        }, 300);
    };
    on('request-more-data', loadMoreComments, { signal });


    const pageLabelEl = container.querySelector('.page-label');
    if (pageLabelEl && view.subtitle) {
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'page-subtitle';
        subtitleEl.innerHTML = view.subtitle;
        pageLabelEl.insertAdjacentElement('afterend', subtitleEl);
    }

    const contentPanel = container.querySelector('.content-panel');
    _initChatViewInteractions(parentId, signal, contentPanel); 
    
    setCommentsScope(parentId, parentType);

    lqUnsub = liveQueryMulti(
        ['users'], // PERBAIKAN: Hapus 'comments' dari sini
        (changes) => {
            if (!changes || !changes.includes('users')) return; // PERBAIKAN
            
            const container = $('.page-container.page-chat');
            if (!container) return;
            
            const list = container.querySelector('.chat-thread[role="log"]');
            if (!list) return;

            const { parentId, parentType } = appState._commentsScope || {};
            if (parentId) {
                renderCommentsPage(parentId, parentType, false, container.querySelector('.chat-view'));
            }
        },
        `mainpage_comments_${parentId}`
    );

    const upsertHandler = (payload = {}) => {
        const { commentData, changeType, replyToId } = payload;
        if (!commentData) return;
        const container = $('.page-container.page-chat');
        if (!container) return; 
        
        const list = container.querySelector('.chat-thread[role="log"]');
        if (!list) return;

        if (commentData.parentId === parentId) {
            upsertCommentInUI(commentData, changeType || 'modified', list, replyToId);
        }
    };
    on('ui.comment.upsert', upsertHandler, { signal });
    busUnsubs.push(() => off('ui.comment.upsert', upsertHandler));

    const textarea = container.querySelector('.composer-input');
    if (textarea && prefilledText) {
        textarea.value = prefilledText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }
}


export async function openCommentsBottomSheet(dataset) {
    const { parentId, parentType, prefilledText } = dataset;
    if (!parentId || !parentType) {
        toast('error', 'Gagal membuka komentar: Data tidak lengkap.');
        return;
    }

    await loadDataForPage('Komentar');

    if (!appState.users || appState.users.length === 0) {
        try {
            const { fetchAndCacheData } = await import("../../services/data/fetch.js");
            const { membersCol } = await import("../../config/firebase.js");
            await fetchAndCacheData('users', membersCol, 'name');
        } catch (e) {
        }
    }
    
    const { threadTitle, iconName, itemTypeLabel, detailAction } = _getCommentThreadContext(parentId, parentType);
    
    const contextHeaderHTML = `
        <div class="chat-item-context-header">
            <div class="context-info">
                <div class="context-icon">${createIcon(iconName, 18)}</div>
                <div class="context-text">
                    <span class="context-item-name">${threadTitle}</span>
                    <span class="context-item-type">${itemTypeLabel}</span>
                </div>
            </div>
            ${detailAction ? `
                <button class="context-action-link" 
                        data-action="${detailAction.action}" 
                        data-item-id="${detailAction.itemId || ''}" 
                        data-expense-id="${detailAction.expenseId || ''}"
                        data-type="${detailAction.type || ''}">
                    Buka Detail
                </button>
            ` : ''}
        </div>
    `;

    const paginationKey = `comments_${parentId}`;
    appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
    const paginationState = appState.pagination[paginationKey];

    const view = _renderCommentsViewChat(parentId, parentType, paginationState);
    
    const fullContent = `
        ${contextHeaderHTML}
        <div class="chat-view">
            <main class="chat-thread" role="log" aria-live="polite">
                ${createListSkeletonHTML(3)}
            </main>
        </div>
    `;

    const modalEl = createModal('actionsPopup', {
        title: 'Komentar',
        content: fullContent,
        footer: view.footer,
        layoutClass: 'is-bottom-sheet is-chat-sheet'
    });

    if (!modalEl) {
        toast('error', 'Gagal membuat modal komentar.');
        return;
    }
    
    const detailLink = modalEl.querySelector('.context-action-link[data-action]');
    if (detailLink) {
        detailLink.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            const actionData = { ...e.currentTarget.dataset };
            
            closeModalImmediate(modalEl); 
            
            setTimeout(() => {
                emit(`ui.action.${action}`, actionData);
            }, 100);
        }, { signal: modalEl.__controller.signal });
    }

    const chatView = modalEl.querySelector('.chat-view');
    if (chatView) {
        const uniqueSelector = `#${modalEl.id} .chat-view`;
        chatObserverInstance = initInfiniteScroll(uniqueSelector);
    }

    setCommentsScope(parentId, parentType);
    _initChatViewInteractions(parentId, modalEl.__controller.signal, modalEl); 
    
    renderCommentsPage(parentId, parentType, false, modalEl);

    const loadMoreComments = () => {
        if (!appState._commentsScope || appState._commentsScope.parentId !== parentId) return;
        
        const state = appState.pagination[paginationKey];
        if (!state || state.isLoading || !state.hasMore) return;
        
        state.isLoading = true;
        const list = modalEl.querySelector('.chat-thread');
        if (list && !list.querySelector('#list-skeleton')) {
            list.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
        }
        
        setTimeout(() => {
            renderCommentsPage(parentId, parentType, true, modalEl);
        }, 300);
    };
    on('request-more-data', loadMoreComments, { signal: modalEl.__controller.signal });

    const lqUnsubModal = liveQueryMulti(
        ['users'], // <-- PERBAIKAN: Hapus 'comments' dari sini
        (changes) => {
            if (!changes || !changes.includes('users')) return; // <-- PERBAIKAN
            
            if (!modalEl || !modalEl.isConnected) return;
            const list = modalEl.querySelector('.chat-thread[role="log"]');
            if (!list) return;

            const { parentId, parentType } = appState._commentsScope || {};
            if (parentId) {
                renderCommentsPage(parentId, parentType, false, modalEl);
            }
        },
        `modal_comments_${parentId}`
    );

    const upsertHandler = (payload = {}) => {
        const { commentData, changeType, replyToId } = payload;
        if (!commentData) return;
        if (modalEl && modalEl.isConnected) {
            const list = modalEl.querySelector('.chat-thread[role="log"]');
            if (!list) {
                 return;
            }

            if (commentData.parentId === parentId) {
                upsertCommentInUI(commentData, changeType || 'modified', list, replyToId);
            }
        }
    };
    on('ui.comment.upsert', upsertHandler, { signal: modalEl.__controller.signal });

    const textarea = modalEl.querySelector('.composer-input');
    if (textarea && prefilledText) {
        textarea.value = prefilledText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }

    const modalId = modalEl.id;
    const cleanupHandler = (closedModalId) => {
        if (closedModalId === modalId) {
            setCommentsScope(null);
            off('ui.modal.closed', cleanupHandler);
            
            if (lqUnsubModal) {
                try { lqUnsubModal.unsubscribe(); } catch (e) {}
            }
            
            delete appState.pagination[paginationKey];
            if (chatObserverInstance) { chatObserverInstance.disconnect(); chatObserverInstance = null; }
            
            emit('ui.dashboard.updateCommentsBadge');
        }
    };
    on('ui.modal.closed', cleanupHandler);
}


function highlight(text, term) {
    if (!term || !text) return text || '';
    const regex = new RegExp(`(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-result-highlight">$1</mark>');
}

function closeSearchPage() {
    if (!searchPageContainer) return;
    searchPageContainer.classList.remove('show');
    searchPageContainer.addEventListener('transitionend', () => {
        searchPageContainer.remove();
        searchPageContainer = null;
        document.body.classList.remove('global-search-active');
    }, { once: true });
}

export function openCommentsSearch({ target } = {}) {
    if (searchPageContainer) return;

    document.body.classList.add('global-search-active');
    searchPageContainer = document.createElement('div');
    searchPageContainer.id = 'global-search-page';
    searchPageContainer.className = 'global-search-page';
    searchPageContainer.innerHTML = `
        <div class="search-page-header">
            <button class="btn-icon" data-action="close-global-search">${createIcon('arrow_back')}</button>
            <div class="search-input-capsule">
                ${createIcon('search', 20)}
                <input type="search" id="global-search-input" placeholder="Cari komentar...">
                <button class="btn-icon" id="clear-search-btn" hidden>${createIcon('x', 18)}</button>
            </div>
        </div>
        <div class="search-results-container chat-search-results"></div>
    `;
    document.body.appendChild(searchPageContainer);

    try {
        if (target) {
            const rect = target.getBoundingClientRect();
            searchPageContainer.dataset.originX = `${rect.left + rect.width / 2}px`;
            searchPageContainer.dataset.originY = `${rect.top + rect.height / 2}px`;
        }
    } catch (_) {}

    requestAnimationFrame(() => {
        searchPageContainer.classList.add('show');
    });

    const searchInput = $('#global-search-input', searchPageContainer);
    const clearButton = $('#clear-search-btn', searchPageContainer);
    const resultsContainer = searchPageContainer.querySelector('.search-results-container');

    function render(term = '') {
        const q = (term || '').toLowerCase();
        const comments = (appState.comments || []).filter(c => !c.isDeleted && (q ? (c.content || '').toLowerCase().includes(q) : true));
        comments.sort((a, b) => (b.createdAt?.seconds || +new Date(b.createdAt)) - (a.createdAt?.seconds || +new Date(a.createdAt)));
        if (comments.length === 0) {
            resultsContainer.innerHTML = getEmptyStateHTML({ icon: 'search', title: 'Tidak ada komentar', desc: 'Coba kata kunci lain.' });
            return;
        }
        resultsContainer.innerHTML = comments.slice(0, 80).map(c => {
            const ts = (c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : new Date(c.createdAt || Date.now()));
            const timeStr = formatRelativeTime(ts);
            const preview = (c.content || '').slice(0, 140).replace(/</g, '&lt;');
            
            const user = (appState.users || []).find(u => u.id === c.userId);
            const photoURL = user?.photoURL;
            const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const avatarHTML = photoURL
                ? `<img src="${photoURL}" alt="${initials}" class="avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                   <span class="avatar-initials" style="display:none;">${initials}</span>`
                : `<span class="avatar-initials">${initials}</span>`;

            return `
                <div class="chat-search-result" data-action="open-comments-view" data-parent-id="${c.parentId}" data-parent-type="${c.parentType}">
                     <div class="msg-group">
                        <div class="avatar">${avatarHTML}</div>
                        <div class="comment-main">
                            <div class="comment-header">
                                <span class="sender">${c.userName || 'Pengguna'}</span>
                                <time>${timeStr}</time>
                            </div>
                            <div class="comment-content">
                                <div class="content selectable-text">${highlight(preview, term)}</div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    searchInput.focus();
    render('');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => render(searchInput.value), 200);
        clearButton.hidden = !searchInput.value;
    });
    clearButton.addEventListener('click', () => { searchInput.value = ''; render(''); clearButton.hidden = true; searchInput.focus(); });

    searchPageContainer.addEventListener('click', (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const action = t.dataset.action;
        if (action === 'close-global-search') closeSearchPage();
        else if (action === 'open-comments-view') {
            closeSearchPage();
            emit('ui.modal.openComments', {
                parentId: t.dataset.parentId,
                parentType: t.dataset.parentType
            });
        }
    });
}

export async function openNewCommentSelector() {
    await loadAllLocalDataToState();

    const getOptions = (key, nameField, filterFn = () => true) => {
        return (appState[key] || [])
            .filter(i => !i.isDeleted && filterFn(i))
            .map(i => ({ value: `${key}:${i.id}`, text: i[nameField] || i.description }));
    };

    const billOptions = getOptions('bills', 'description', b => b.status === 'unpaid');
    const expenseOptions = getOptions('expenses', 'description', e => e.status !== 'delivery_order');
    const loanOptions = getOptions('fundingSources', 'description', l => l.status === 'unpaid');

    const allOptions = [
        ...billOptions.map(o => ({ ...o, text: `[Tagihan] ${o.text}` })),
        ...expenseOptions.map(o => ({ ...o, text: `[Pengeluaran] ${o.text}` })),
        ...loanOptions.map(o => ({ ...o, text: `[Pinjaman] ${o.text}` })),
    ];
    allOptions.sort((a, b) => a.text.localeCompare(b.text));

    const content = `
        <form id="new-comment-form">
            <p>Pilih item yang ingin Anda diskusikan.</p>
            ${createMasterDataSelect('comment-parent', 'Pilih Item', allOptions, '', null, true)}
            <textarea name="content" rows="4" placeholder="Tulis komentar pertama..." class="form-input"></textarea>
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary">Mulai Diskusi</button>
            </div>
        </form>
    `;
    const modal = createModal('dataDetail', { title: 'Mulai Diskusi Baru', content });
    initCustomSelects(modal);

    modal.querySelector('#new-comment-form').addEventListener('submit', async e => {
        e.preventDefault();
        const parentVal = modal.querySelector('input[name="comment-parent"]').value;
        const contentVal = modal.querySelector('textarea[name="content"]').value.trim();
        if (!parentVal) {
            toast('error', 'Silakan pilih item.');
            return;
        }
        if (!contentVal) {
            toast('error', 'Silakan tulis komentar pertama.');
            return;
        }

        const [parentTypeKey, parentId] = parentVal.split(':');
        let parentType = 'unknown';
        if (parentTypeKey === 'bills') parentType = 'bill';
        else if (parentTypeKey === 'expenses') parentType = 'expense';
        else if (parentTypeKey === 'fundingSources') parentType = 'loan';

        closeModalImmediate(modal);
        
        emit('ui.modal.openComments', {
            parentId: parentId,
            parentType: parentType,
            prefilledText: contentVal
        });
    });
}