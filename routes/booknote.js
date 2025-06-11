const express = require('express');
const mongoose = require('mongoose');
const BookNote = require('../models/bookNote'); // Assuming this path is correct
const exceljs = require('exceljs'); // 用于导出Excel

module.exports = (app, Booknote, requireLogin, mongoose, path, querystring, upload) => {

    // GET 读书笔记列表 (查询功能)
    app.get('/booknote', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const { searchTitle, searchAuthor, searchCategory, minRating, page = 1, limit = 10 } = req.query;

            let query = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (searchTitle) {
                query.$or = [
                    { title: { $regex: searchTitle, $options: 'i' } },
                    { notes: { $regex: searchTitle, $options: 'i' } }
                ];
            }
            if (searchAuthor) {
                query.author = { $regex: searchAuthor, $options: 'i' };
            }
            if (searchCategory) {
                query.category = { $regex: searchCategory, $options: 'i' };
            }
            if (minRating) {
                query.rating = { $gte: parseInt(minRating) };
            }

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { readDate: -1, createdAt: -1 }
            };

            const result = await BookNote.paginate(query, options);

            res.render('booknotes/index', {
                bookNotes: result.docs,
                currentPage: result.page,
                totalPages: result.totalPages,
                limit: result.limit,
                searchTitle: searchTitle || '',
                searchAuthor: searchAuthor || '',
                searchCategory: searchCategory || '',
                minRating: minRating || '',
                activeMenu: 'booknotes',
                layout: 'booknotes/layout.ejs', // Explicitly specify the layout
                title: '读书笔记列表' ,// <-- 新增这一行
                pageTitle: '读书笔记列表' 
            });

        } catch (err) {
            console.error('Error fetching book notes:', err);
            res.status(500).send('Server Error');
        }
    });

    // GET 新增读书笔记页面
    app.get('/booknote/add', requireLogin, (req, res) => {
        res.render('booknotes/add', {
            activeMenu: 'booknotes',
            layout: 'booknotes/layout.ejs', // Explicitly specify the layout
            title: '新增读书笔记',
            pageTitle: '新增读书笔记' // <-- 新增这一行
        });
    });

    // POST 新增读书笔记 (这里是重定向，不需要 render，所以不需要布局设置)
    app.post('/booknote/add', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const { title, author, publishYear, category, tags, readDate, rating, notes } = req.body;

            const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '') : [];

            const newBookNote = new BookNote({
                userId,
                title,
                author: author || '未知',
                publishYear: publishYear ? parseInt(publishYear) : undefined,
                category: category || '未分类',
                tags: tagsArray,
                readDate: readDate || Date.now(),
                rating: rating ? parseInt(rating) : undefined,
                notes
            });

            await newBookNote.save();
            req.flash('success_msg', '读书笔记添加成功！');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        } catch (err) {
            console.error('Error adding book note:', err);
            req.flash('error_msg', '添加读书笔记失败：' + err.message);
            res.redirect('/booknote/add'); // Corrected redirect to /booknote/add
        }
    });

    // GET 编辑读书笔记页面
    app.get('/booknote/edit/:id', requireLogin, async (req, res) => {
        try {
            const bookNote = await BookNote.findOne({ _id: req.params.id, userId: req.session.userId });
            if (!bookNote) {
                req.flash('error_msg', '未找到该读书笔记或无权限编辑。');
                return res.redirect('/booknote'); // Corrected redirect to /booknote
            }
            res.render('booknotes/edit', {
                bookNote,
                activeMenu: 'booknotes',
                layout: 'booknotes/layout.ejs', // Explicitly specify the layout
                title: '编辑读书笔记',
                pageTitle: '编辑读书笔记' // <-- 新增这一行
            });
        } catch (err) {
            console.error('Error fetching book note for edit:', err);
            req.flash('error_msg', '获取读书笔记失败。');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        }
    });

    // PUT 更新读书笔记 (这里是重定向，不需要 render)
    app.put('/booknote/edit/:id', requireLogin, async (req, res) => {
        try {
            const { title, author, publishYear, category, tags, readDate, rating, notes } = req.body;
            const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '') : [];

            const updatedNote = await BookNote.findOneAndUpdate(
                { _id: req.params.id, userId: req.session.userId },
                {
                    title,
                    author: author || '未知',
                    publishYear: publishYear ? parseInt(publishYear) : undefined,
                    category: category || '未分类',
                    tags: tagsArray,
                    readDate: readDate || Date.now(),
                    rating: rating ? parseInt(rating) : undefined,
                    notes,
                    updatedAt: Date.now()
                },
                { new: true }
            );

            if (!updatedNote) {
                req.flash('error_msg', '未找到该读书笔记或无权限更新。');
                return res.redirect('/booknote'); // Corrected redirect to /booknote
            }
            req.flash('success_msg', '读书笔记更新成功！');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        } catch (err) {
            console.error('Error updating book note:', err);
            req.flash('error_msg', '更新读书笔记失败：' + err.message);
            res.redirect(`/booknote/edit/${req.params.id}`); // Corrected redirect to /booknote/edit/:id
        }
    });

    // DELETE 删除读书笔记 (这里是重定向，不需要 render)
    app.delete('/booknote/delete/:id', requireLogin, async (req, res) => {
        try {
            const deletedNote = await BookNote.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
            if (!deletedNote) {
                req.flash('error_msg', '未找到该读书笔记或无权限删除。');
                return res.redirect('/booknote'); // Corrected redirect to /booknote
            }
            req.flash('success_msg', '读书笔记删除成功！');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        } catch (err) {
            console.error('Error deleting book note:', err);
            req.flash('error_msg', '删除读书笔记失败。');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        }
    });

    // GET 读书笔记统计
    app.get('/booknote/statistics', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const { startDate, endDate, groupByField = 'category' } = req.query;

            let match = { userId: new mongoose.Types.ObjectId(String(userId)) };

            if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                match.readDate = {
                    $gte: start,
                    $lte: end
                };
            }

            let groupStage;
            switch (groupByField) {
                case 'author':
                case 'category':
                case 'publishYear':
                case 'rating':
                    groupStage = { _id: `$${groupByField}`, count: { $sum: 1 }, avgRating: { $avg: '$rating' } };
                    break;
                case 'readYear':
                    groupStage = { _id: { $year: '$readDate' }, count: { $sum: 1 }, avgRating: { $avg: '$rating' } };
                    break;
                case 'readMonth':
                    groupStage = {
                        _id: {
                            year: { $year: '$readDate' },
                            month: { $month: '$readDate' }
                        },
                        count: { $sum: 1 },
                        avgRating: { $avg: '$rating' }
                    };
                    break;
                default:
                    groupStage = { _id: null, count: { $sum: 1 }, avgRating: { $avg: '$rating' } };
                    break;
            }

            const pipeline = [
                { $match: match },
                { $group: groupStage },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id': 1 } }
            ];

            const statistics = await BookNote.aggregate(pipeline);

            res.render('booknotes/statistics', {
                statistics,
                startDate: startDate || '',
                endDate: endDate || '',
                groupByField,
                activeMenu: 'booknotesStatistics',
                layout: 'booknotes/layout.ejs', // Explicitly specify the layout
                title: '读书笔记统计',
                pageTitle: '读书笔记统计' // <-- 新增这一行
            });

        } catch (err) {
            console.error('Error generating book notes statistics:', err);
            res.status(500).send('Server Error');
        }
    });

    // GET 导出读书笔记 (CSV/Excel) (这里是发送文件，不需要 render)
    app.get('/booknote/export', requireLogin, async (req, res) => {
        try {
            const userId = req.session.userId;
            const bookNotes = await BookNote.find({ userId: new mongoose.Types.ObjectId(String(userId)) }).sort({ readDate: -1, createdAt: -1 }).lean();

            const workbook = new exceljs.Workbook();
            const worksheet = workbook.addWorksheet('读书笔记');

            worksheet.columns = [
                { header: '书名', key: 'title', width: 30 },
                { header: '作者', key: 'author', width: 20 },
                { header: '出版年份', key: 'publishYear', width: 15 },
                { header: '类别', key: 'category', width: 15 },
                { header: '标签', key: 'tags', width: 25 },
                { header: '阅读日期', key: 'readDateFormatted', width: 15 },
                { header: '评分', key: 'rating', width: 10 },
                { header: '笔记内容', key: 'notes', width: 60 },
                { header: '创建时间', key: 'createdAtFormatted', width: 20 },
                { header: '更新时间', key: 'updatedAtFormatted', width: 20 }
            ];

            bookNotes.forEach(note => {
                worksheet.addRow({
                    title: note.title,
                    author: note.author,
                    publishYear: note.publishYear,
                    category: note.category,
                    tags: note.tags.join(', '),
                    readDateFormatted: note.readDate ? new Date(note.readDate).toLocaleDateString('zh-CN') : '',
                    rating: note.rating,
                    notes: note.notes,
                    createdAtFormatted: note.createdAt ? new Date(note.createdAt).toLocaleString('zh-CN') : '',
                    updatedAtFormatted: note.updatedAt ? new Date(note.updatedAt).toLocaleString('zh-CN') : ''
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent('读书笔记_导出.xlsx'));

            await workbook.xlsx.write(res);
            res.end();

        } catch (err) {
            console.error('Error exporting book notes:', err);
            req.flash('error_msg', '导出读书笔记失败。');
            res.redirect('/booknote'); // Corrected redirect to /booknote
        }
    });

};